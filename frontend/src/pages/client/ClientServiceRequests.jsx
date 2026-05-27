import { useEffect, useState } from 'react';
import Layout from '../../components/layout/Layout';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import {
  createServiceRequest,
  fetchServiceTickets,
  fetchServiceTypes,
  reverseGeocodeLocation,
  searchLocations
} from '../../api/api';
import { useAuth } from '../../context/AuthContext';
import { getLocalDateInputValue } from '../../utils/date';
import { CALABARZON_BOUNDS, MAP_ATTRIBUTION, MAP_TILE_URL, clampToCalabarzon } from '../../utils/mapRegion';
import { FiSearch } from 'react-icons/fi';
import { formatTicketId } from '../../utils/roleIds';

// Debounce helper
const useDebounce = (value, delay) => {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => clearTimeout(handler);
  }, [value, delay]);

  return debouncedValue;
};

/** Region IV-A (Cavite, Laguna, Batangas, Rizal, Quezon) — map + search limited to this area. */
const TIME_SLOT_OPTIONS = [
  { value: '', label: 'No preference' },
  { value: 'morning', label: 'Morning (8 AM - 11 AM)' },
  { value: 'midday', label: 'Midday (11 AM - 2 PM)' },
  { value: 'afternoon', label: 'Afternoon (2 PM - 5 PM)' },
  { value: 'evening', label: 'Evening (5 PM - 8 PM)' }
];

const inputClass = 'w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100';
const labelClass = 'mb-1 block text-sm font-medium text-slate-700';

function LocationPicker({ lat, lng, setLat, setLng, onLocationChange }) {
  const map = useMapEvents({
    click(e) {
      const [clat, clng] = clampToCalabarzon(e.latlng.lat, e.latlng.lng);
      setLat(clat);
      setLng(clng);
      if (onLocationChange) {
        onLocationChange(clat, clng);
      }
    }
  });

  // Update map center when coordinates change
  useEffect(() => {
    if (lat != null && lng != null && map) {
      map.setView([lat, lng], map.getZoom());
    }
  }, [lat, lng, map]);

  return lat != null && lng != null ? <Marker position={[lat, lng]} /> : null;
}

export default function ClientServiceRequests() {
  const { user } = useAuth();
  const [tickets, setTickets] = useState([]);
  const [serviceTypes, setServiceTypes] = useState([]);
  const [serviceTypeIds, setServiceTypeIds] = useState([]);
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [province, setProvince] = useState('');
  const [notes, setNotes] = useState('');
  const [preferredDate, setPreferredDate] = useState('');
  const [preferredTimeSlot, setPreferredTimeSlot] = useState('');
  const [schedulingNotes, setSchedulingNotes] = useState('');
  const [latitude, setLatitude] = useState(null);
  const [longitude, setLongitude] = useState(null);
  const [message, setMessage] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [mapCenter, setMapCenter] = useState(() => {
    const c = CALABARZON_BOUNDS.getCenter();
    return [c.lat, c.lng];
  });

  const debouncedSearchQuery = useDebounce(searchQuery, 500);
  const selectedServiceTypes = serviceTypes.filter((serviceType) =>
    serviceTypeIds.some((serviceTypeId) => String(serviceType.id) === String(serviceTypeId))
  );
  const selectedServiceMaterials = selectedServiceTypes.flatMap((serviceType) =>
    Array.isArray(serviceType?.inventory_requirements)
      ? serviceType.inventory_requirements
        .filter((requirement) => requirement.auto_reserve)
        .map((requirement) => ({ ...requirement, service_type_name: serviceType.name }))
      : []
  );

  const toggleServiceType = (serviceTypeId) => {
    setServiceTypeIds((current) => {
      const normalizedId = String(serviceTypeId);
      if (current.includes(normalizedId)) {
        return current.filter((id) => id !== normalizedId);
      }
      return [...current, normalizedId];
    });
  };

  const loadPageData = async () => {
    try {
      const [ticketData, serviceTypeData] = await Promise.all([
        fetchServiceTickets(),
        fetchServiceTypes()
      ]);
      setTickets(ticketData);
      setServiceTypes(serviceTypeData);
      setError('');
    } catch (err) {
      setTickets([]);
      setServiceTypes([]);
      setError(err.message || 'Unable to load service tickets.');
    }
  };

  useEffect(() => {
    loadPageData();
  }, []);

  useEffect(() => {
    searchLocation(debouncedSearchQuery);
  }, [debouncedSearchQuery]);

  const searchLocation = async (query) => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }

    try {
      const sw = CALABARZON_BOUNDS.getSouthWest();
      const ne = CALABARZON_BOUNDS.getNorthEast();
      const viewbox = `${sw.lng},${ne.lat},${ne.lng},${sw.lat}`;
      const results = await searchLocations({ query, viewbox, limit: 5 });
      setSearchResults(results);
    } catch (err) {
      setSubmitError(err.message || 'Location search failed.');
      setSearchResults([]);
    }
  };

  const selectSearchResult = (result) => {
    const lat = parseFloat(result.lat);
    const lng = parseFloat(result.lon);
    const [clat, clng] = clampToCalabarzon(lat, lng);
    setLatitude(clat);
    setLongitude(clng);
    setMapCenter([clat, clng]);
    setAddress((result.display_name || '').split(',')[0]);
    setSearchQuery('');
    setSearchResults([]);
  };

  // Reverse geocoding: Get address from coordinates
  const reverseGeocode = async (lat, lng) => {
    try {
      const result = await reverseGeocodeLocation({ lat, lng });
      if (result.address) {
        const road = result.address.road || result.address.name || '';
        const city = result.address.city || result.address.town || result.address.village || '';
        const province = result.address.state || result.address.province || '';

        setAddress(road || result.display_name.split(',')[0]);
        setCity(city);
        setProvince(province);
      }
    } catch (err) {
      setSubmitError(err.message || 'Could not read address from the selected pin.');
    }
  };

  // Handle map location change (when user clicks on map)
  const handleLocationChange = (lat, lng) => {
    const [clat, clng] = clampToCalabarzon(lat, lng);
    setMapCenter([clat, clng]);
    reverseGeocode(clat, clng);
  };

  const createRequest = async (e) => {
    e.preventDefault();
    setSubmitError('');

    if (serviceTypeIds.length === 0) {
      setMessage('');
      setSubmitError('Please choose at least one service type.');
      return;
    }
    if (!serviceTypeIds.every((serviceTypeId) => serviceTypes.some((serviceType) => String(serviceType.id) === String(serviceTypeId)))) {
      setMessage('');
      setSubmitError('Please choose only available service types.');
      return;
    }
    if (!notes.trim()) {
      setMessage('');
      setSubmitError('Please add a short description of the request.');
      return;
    }
    if (latitude == null || longitude == null) {
      setMessage('');
      setSubmitError('Please select location on the map (lat/lng).');
      return;
    }
    if (!address.trim()) {
      setMessage('');
      setSubmitError('Please add a location note (street/landmark).');
      return;
    }
    if (!city.trim()) {
      setMessage('');
      setSubmitError('Please enter a city.');
      return;
    }
    if (!province.trim()) {
      setMessage('');
      setSubmitError('Please enter a province.');
      return;
    }
    if (!preferredDate) {
      setMessage('');
      setSubmitError('Please select a preferred appointment date.');
      return;
    }

    setIsSubmitting(true);
    setMessage('Submitting service request...');
    try {
      const createdRequest = await createServiceRequest({
        service_type: Number(serviceTypeIds[0]),
        service_types: serviceTypeIds.map((serviceTypeId) => Number(serviceTypeId)),
        description: notes.trim(),
        priority: 'Normal',
        preferred_date: preferredDate || null,
        preferred_time_slot: preferredTimeSlot || null,
        scheduling_notes: schedulingNotes.trim() || null,
        location_address: address.trim(),
        location_city: city.trim(),
        location_province: province.trim(),
        latitude,
        longitude
      });
      setSubmitError('');
      setMessage(`Service request #${createdRequest.id} submitted for review.`);
      setAddress('');
      setCity('');
      setProvince('');
      setNotes('');
      setServiceTypeIds([]);
      setPreferredDate('');
      setPreferredTimeSlot('');
      setSchedulingNotes('');
      setLatitude(null);
      setLongitude(null);
      const c = CALABARZON_BOUNDS.getCenter();
      setMapCenter([c.lat, c.lng]);
      await loadPageData();
      setTimeout(() => setMessage(''), 3000);
    } catch (err) {
      setMessage('');
      setSubmitError(err.message || 'Unable to create service request.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const messageToneClassName = message.startsWith('Service request #')
    ? 'text-green-600'
    : 'text-slate-600';

  return (
    <Layout>
      <section className="card p-5">
        <h2 className="text-lg font-semibold text-slate-900">Create Service Request</h2>
        <p className="mt-1 text-sm text-slate-500">Tell us what you need, choose a preferred schedule, and pin the service location.</p>
      </section>
      {error && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>}
      <div className="mt-4 grid gap-5 lg:grid-cols-2">
        <form onSubmit={createRequest} className="card space-y-4 p-5">
          <div>
            <label className={labelClass}>Client</label>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
              {[user?.first_name, user?.last_name].filter(Boolean).join(' ').trim() || user?.username || 'Signed-in client'}
            </div>
          </div>
          <div>
            <label className={labelClass}>Service Types</label>
            <div className="rounded-xl border border-slate-300 bg-white p-2">
              {serviceTypes.length > 0 ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  {serviceTypes.map((serviceType) => {
                    const checked = serviceTypeIds.includes(String(serviceType.id));
                    return (
                      <label
                        key={serviceType.id}
                        className={`flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 text-sm transition ${
                          checked ? 'border-brand-300 bg-brand-50 text-brand-800' : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleServiceType(serviceType.id)}
                          className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-500 focus:ring-brand-500"
                        />
                        <span>{serviceType.name}</span>
                      </label>
                    );
                  })}
                </div>
              ) : (
                <div className="px-3 py-2 text-sm text-slate-500">No service types available</div>
              )}
            </div>
            {selectedServiceTypes.length > 0 && (
              <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                <div className="font-semibold text-slate-800">
                  Selected services: {selectedServiceTypes.map((serviceType) => serviceType.name).join(', ')}
                </div>
                {selectedServiceMaterials.length > 0 ? (
                  <>
                    <div className="mt-2 font-semibold text-slate-800">Materials reserved after technician assignment</div>
                    <div className="mt-1">
                      {selectedServiceMaterials.map((requirement) => (
                        `${requirement.service_type_name}: ${requirement.item_name} x${requirement.quantity}`
                      )).join(', ')}
                    </div>
                  </>
                ) : (
                  <span className="mt-2 block">No auto-reserved materials configured for the selected services.</span>
                )}
              </div>
            )}
          </div>
          <div>
            <label className={labelClass}>Address / Landmark *</label>
            <input value={address} onChange={(e) => setAddress(e.target.value)} className={inputClass} placeholder="E.g., near SM Mall of Asia" required />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={labelClass}>City *</label>
              <input value={city} onChange={(e) => setCity(e.target.value)} className={inputClass} placeholder="Enter city name" required />
            </div>
            <div>
              <label className={labelClass}>Province *</label>
              <input value={province} onChange={(e) => setProvince(e.target.value)} className={inputClass} placeholder="Enter province name" required />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={labelClass}>Preferred Appointment Date *</label>
              <input
                type="date"
                value={preferredDate}
                onChange={(e) => setPreferredDate(e.target.value)}
                min={getLocalDateInputValue()}
                className={inputClass}
                required
              />
            </div>
            <div>
              <label className={labelClass}>Preferred Time Slot</label>
              <select
                value={preferredTimeSlot}
                onChange={(e) => setPreferredTimeSlot(e.target.value)}
                className={inputClass}
              >
                {TIME_SLOT_OPTIONS.map((option) => (
                  <option key={option.value || 'none'} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className={labelClass}>Scheduling Notes</label>
            <textarea
              value={schedulingNotes}
              onChange={(e) => setSchedulingNotes(e.target.value)}
              className={inputClass}
              rows="2"
              placeholder="Gate access, best contact time, building rules, or timing preferences."
            />
          </div>
          <div>
            <label className={labelClass}>Request Details</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className={inputClass} rows="3" />
          </div>
          <button
            type="submit"
            disabled={isSubmitting || serviceTypes.length === 0}
            className="rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? 'Submitting...' : 'Submit Request'}
          </button>
          {submitError && <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{submitError}</p>}
          {message && <p className={`rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm ${messageToneClassName}`}>{message}</p>}
        </form>

        <div className="card p-5">
          <h3 className="text-lg font-semibold text-slate-900">Location Picker</h3>
          <p className="mb-3 text-sm text-slate-500">
            Search or tap the map to set your pin. Service area is <strong className="font-medium text-slate-700">Calabarzon (Region IV-A)</strong> only
            (Cavite, Laguna, Batangas, Rizal, Quezon).
          </p>

          <div className="mb-4">
            <div className="relative">
              <div className="flex items-center gap-2 rounded-xl border border-slate-300 px-3 py-2 focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-100">
                <FiSearch className="text-slate-400" size={18} />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search for address, city, or landmark..."
                  className="flex-1 bg-transparent text-sm outline-none"
                  autoComplete="off"
                />
              </div>

              {searchResults.length > 0 && (
                <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-60 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-elevated">
                  {searchResults.map((result, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => selectSearchResult(result)}
                      className="w-full border-b border-slate-100 px-3 py-2 text-left text-sm text-slate-700 transition last:border-b-0 hover:bg-brand-50"
                    >
                      <div className="font-medium truncate">{result.display_name.split(',')[0]}</div>
                      <div className="text-xs text-slate-500 truncate">{result.display_name}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="map-wrapper h-60 border border-slate-200">
            <MapContainer
              center={mapCenter}
              zoom={10}
              className="h-full w-full"
              maxBounds={CALABARZON_BOUNDS}
              maxBoundsViscosity={1}
              minZoom={9}
              maxZoom={18}
            >
              <TileLayer url={MAP_TILE_URL} attribution={MAP_ATTRIBUTION} />
              <LocationPicker lat={latitude} lng={longitude} setLat={setLatitude} setLng={setLongitude} onLocationChange={handleLocationChange} />
            </MapContainer>
          </div>
          <div className="mt-3 text-sm font-medium text-slate-700">
            Selected location: {latitude != null ? latitude.toFixed(6) : 'unset'} , {longitude != null ? longitude.toFixed(6) : 'unset'}
          </div>
          <button type="button" onClick={() => {
            navigator.geolocation.getCurrentPosition((pos) => {
              const rawLat = pos.coords.latitude;
              const rawLng = pos.coords.longitude;
              const [clat, clng] = clampToCalabarzon(rawLat, rawLng);
              setLatitude(clat);
              setLongitude(clng);
              setMapCenter([clat, clng]);
              setSubmitError('');
              const moved =
                Math.abs(clat - rawLat) > 0.0005 || Math.abs(clng - rawLng) > 0.0005;
              setMessage(
                moved
                  ? 'Your position was outside Calabarzon; the pin was moved to the nearest point inside the service area.'
                  : 'Using your current location for the pin.'
              );
            }, () => {
              setMessage('');
              setSubmitError('Could not get current location.');
            });
          }} className="mt-2 rounded-xl bg-brand-500 px-3 py-2 text-sm font-semibold text-white transition hover:bg-brand-600">Use My Location</button>

          <h3 className="mt-5 text-lg font-semibold text-slate-900">My Service Tickets</h3>
          <ul className="mt-2 space-y-1 text-sm text-slate-600">
            {tickets.slice(0, 5).map((ticket) => (
              <li key={ticket.id} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">{formatTicketId(ticket.id)} {ticket.service} - {ticket.status}</li>
            ))}
          </ul>
        </div>
      </div>
    </Layout>
  );
}
