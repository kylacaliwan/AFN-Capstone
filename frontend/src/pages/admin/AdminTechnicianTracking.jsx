import { useCallback, useEffect, useMemo, useState } from 'react';
import Layout from '../../components/layout/Layout';
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { fetchTrackingData } from '../../api/api';
import {
  CALABARZON_BOUNDS,
  CALABARZON_CENTER,
  CALABARZON_MIN_ZOOM,
  MAP_ATTRIBUTION,
  MAP_TILE_URL
} from '../../utils/mapRegion';
import { formatTicketId } from '../../utils/roleIds';

const TECH_PIN_COLORS = ['#2563eb', '#16a34a', '#f97316', '#8b5cf6', '#0891b2', '#e11d48'];
const TECH_STATUS_RING = {
  available: '#22c55e',
  on_job: '#38bdf8',
  offline: '#94a3b8'
};

const getNameHash = (value = '') => value.split('').reduce((total, char) => total + char.charCodeAt(0), 0);

const getTechInitials = (name = '') =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('') || 'T';

const createTechIcon = (name = '', status = 'offline') => {
  const color = TECH_PIN_COLORS[getNameHash(name) % TECH_PIN_COLORS.length];
  const statusColor = TECH_STATUS_RING[status] || TECH_STATUS_RING.offline;
  const initials = getTechInitials(name);

  return L.divIcon({
    className: '',
    html: `
      <div style="position:relative;width:42px;height:42px;">
        <div style="position:absolute;inset:0;border-radius:9999px;background:${color};opacity:.18;box-shadow:0 0 0 8px ${color}22;"></div>
        <div style="position:absolute;inset:5px;display:flex;align-items:center;justify-content:center;border-radius:9999px;background:linear-gradient(135deg,${color},#0f172a);color:#fff;border:3px solid ${statusColor};box-shadow:0 10px 22px rgba(15,23,42,0.28);font-size:12px;font-weight:800;">
          ${initials}
        </div>
      </div>
    `,
    iconSize: [42, 42],
    iconAnchor: [21, 21],
    popupAnchor: [0, -18]
  });
};

const ticketIcon = L.divIcon({
  className: '',
  html: `
    <div style="display:flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:9999px;background:#f59e0b;border:4px solid #fff7ed;box-shadow:0 8px 18px rgba(217,119,6,0.32);">
      <div style="width:8px;height:8px;border-radius:9999px;background:#7c2d12;"></div>
    </div>
  `,
  iconSize: [24, 24],
  iconAnchor: [12, 12],
  popupAnchor: [0, -10]
});

const TRACKING_REFRESH_MS = 15000;

const routeTone = {
  not_started: '#2563eb',
  in_progress: '#059669',
  on_hold: '#d97706'
};

const formatDuration = (seconds) => {
  const value = Number(seconds);
  if (!Number.isFinite(value) || value <= 0) return 'ETA unavailable';
  const minutes = Math.max(Math.round(value / 60), 1);
  return `${minutes} min ETA`;
};

const formatDistance = (meters) => {
  const value = Number(meters);
  if (!Number.isFinite(value) || value <= 0) return 'Distance unavailable';
  if (value >= 1000) return `${(value / 1000).toFixed(1)} km`;
  return `${Math.round(value)} m`;
};

const formatLastSeen = (value) => {
  if (!value) return 'No GPS update yet';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'No GPS update yet';
  const minutes = Math.max(Math.floor((Date.now() - date.getTime()) / 60000), 0);
  if (minutes < 1) return 'Updated just now';
  if (minutes === 1) return 'Updated 1 min ago';
  return `Updated ${minutes} min ago`;
};

const getRouteCoords = (ticket, tech) => {
  const coordinates = ticket?.routeGeometry?.coordinates;
  if (Array.isArray(coordinates) && coordinates.length > 1) {
    return coordinates
      .map((coord) => [Number(coord[1]), Number(coord[0])])
      .filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng));
  }
  if (
    Number.isFinite(tech?.lat) &&
    Number.isFinite(tech?.lng) &&
    Number.isFinite(ticket?.lat) &&
    Number.isFinite(ticket?.lng)
  ) {
    return [[tech.lat, tech.lng], [ticket.lat, ticket.lng]];
  }
  return [];
};

function TrackingMapController({ onReady }) {
  const map = useMap();

  useEffect(() => {
    onReady(map);
    const resizeTimer = window.setTimeout(() => map.invalidateSize(), 0);

    return () => {
      window.clearTimeout(resizeTimer);
      onReady(null);
    };
  }, [map, onReady]);

  return null;
}

export default function AdminTechnicianTracking() {
  const [trackData, setTrackData] = useState({ techMarkers: [], ticketMarkers: [] });
  const [filterStatus, setFilterStatus] = useState('all');
  const [mapInstance, setMapInstance] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [focusedTarget, setFocusedTarget] = useState(null);

  const handleMapReady = useCallback((instance) => {
    setMapInstance(instance);
  }, []);

  const loadTrackingData = useCallback(async ({ showLoading = false } = {}) => {
    if (showLoading) {
      setLoading(true);
    }
    setError('');

    try {
      const data = await fetchTrackingData();
      setTrackData({
        techMarkers: Array.isArray(data?.techMarkers) ? data.techMarkers : [],
        ticketMarkers: Array.isArray(data?.ticketMarkers) ? data.ticketMarkers : []
      });
    } catch (loadError) {
      setTrackData({ techMarkers: [], ticketMarkers: [] });
      setError('Live tracking data is unavailable. Please check the backend /tracking endpoint.');
    } finally {
      if (showLoading) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    loadTrackingData({ showLoading: true });
    const refreshTimer = window.setInterval(() => loadTrackingData(), TRACKING_REFRESH_MS);

    return () => window.clearInterval(refreshTimer);
  }, [loadTrackingData]);

  const filteredTechs = trackData.techMarkers.filter(
    (tech) => filterStatus === 'all' || tech.status === filterStatus
  );
  const openTickets = trackData.ticketMarkers.filter((ticket) => ticket.status !== 'completed');
  const hasCoords = (target) =>
    Number.isFinite(target?.lat) &&
    Number.isFinite(target?.lng) &&
    CALABARZON_BOUNDS.contains([target.lat, target.lng]);
  const techsWithCoords = filteredTechs.filter(hasCoords);
  const ticketsWithCoords = openTickets.filter(hasCoords);
  const techById = useMemo(
    () => new Map(techsWithCoords.map((tech) => [Number(tech.id), tech])),
    [techsWithCoords]
  );
  const activeRoutes = useMemo(
    () => ticketsWithCoords
      .filter((ticket) => ticket.technicianId && techById.has(Number(ticket.technicianId)))
      .map((ticket) => {
        const tech = techById.get(Number(ticket.technicianId));
        return {
          id: ticket.id,
          ticket,
          tech,
          coords: getRouteCoords(ticket, tech),
          color: routeTone[ticket.status] || '#2563eb'
        };
      })
      .filter((route) => route.coords.length > 1),
    [ticketsWithCoords, techById]
  );
  const techsWithoutCoords = filteredTechs.length - techsWithCoords.length;
  const ticketsWithoutCoords = openTickets.length - ticketsWithCoords.length;
  const mapPoints = useMemo(
    () => [
      ...techsWithCoords.map((tech) => [tech.lat, tech.lng]),
      ...ticketsWithCoords.map((ticket) => [ticket.lat, ticket.lng])
    ],
    [techsWithCoords, ticketsWithCoords]
  );

  useEffect(() => {
    if (!mapInstance) return;

    mapInstance.setMaxBounds(CALABARZON_BOUNDS);
    mapInstance.options.maxBoundsViscosity = 1.0;
    mapInstance.setMinZoom(CALABARZON_MIN_ZOOM);

    if (focusedTarget) {
      return;
    }

    if (mapPoints.length > 0) {
      if (mapPoints.length > 1) {
        mapInstance.fitBounds(L.latLngBounds(mapPoints), { padding: [32, 32], maxZoom: 13 });
        return;
      }

      if (mapPoints.length === 1) {
        mapInstance.setView(mapPoints[0], 12);
        return;
      }
    }

    mapInstance.setView(CALABARZON_CENTER, CALABARZON_MIN_ZOOM);
  }, [mapInstance, mapPoints, focusedTarget]);

  const focusLocation = (target) => {
    if (!target || !hasCoords(target) || !mapInstance) {
      return;
    }

    setFocusedTarget(target);
    mapInstance.flyTo([target.lat, target.lng], target.zoom || 16, { duration: 1.2 });
  };

  const clearFocus = () => {
    setFocusedTarget(null);
    if (!mapInstance) return;

    if (mapPoints.length > 1) {
      mapInstance.fitBounds(L.latLngBounds(mapPoints), { padding: [32, 32], maxZoom: 13 });
    } else if (mapPoints.length === 1) {
      mapInstance.setView(mapPoints[0], 12);
    } else {
      mapInstance.setView(CALABARZON_CENTER, CALABARZON_MIN_ZOOM);
    }
  };

  return (
    <Layout>
      <div className="mb-4 flex flex-col gap-4 lg:flex-row">
        <h2 className="flex-1 text-2xl font-semibold text-slate-800">Technician Tracking</h2>
        <div className="flex gap-2">
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            disabled={loading}
            className="rounded-lg border px-4 py-2"
          >
            <option value="all">All Technicians</option>
            <option value="available">Available</option>
            <option value="on_job">On Job</option>
            <option value="offline">Offline</option>
          </select>
          {focusedTarget && (
            <button
              onClick={clearFocus}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
            >
              Show all visible markers
            </button>
          )}
        </div>
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <div className="text-xs font-medium uppercase text-slate-500">Technicians Online</div>
          <div className="mt-1 text-2xl font-semibold text-slate-900">{techsWithCoords.length}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <div className="text-xs font-medium uppercase text-slate-500">Active Routes</div>
          <div className="mt-1 text-2xl font-semibold text-blue-700">{activeRoutes.length}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <div className="text-xs font-medium uppercase text-slate-500">Waiting for GPS</div>
          <div className="mt-1 text-2xl font-semibold text-amber-600">{techsWithoutCoords + ticketsWithoutCoords}</div>
        </div>
      </div>

      {loading && (
        <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          Loading live tracking data...
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {focusedTarget && (
        <div className="mb-4 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-800">
          Map centered on {focusedTarget.kind === 'tech' ? 'technician' : 'ticket'}:{' '}
          <strong>{focusedTarget.label}</strong>
        </div>
      )}

      <div className="map-wrapper relative h-[70vh] shadow-lg">
        <MapContainer
          center={CALABARZON_CENTER}
          zoom={CALABARZON_MIN_ZOOM}
          minZoom={CALABARZON_MIN_ZOOM}
          maxBounds={CALABARZON_BOUNDS}
          maxBoundsViscosity={1.0}
          scrollWheelZoom={true}
          className="h-full w-full"
        >
          <TrackingMapController onReady={handleMapReady} />
          <TileLayer url={MAP_TILE_URL} attribution={MAP_ATTRIBUTION} />

          {activeRoutes.map((route) => (
            <Polyline
              key={`route-${route.id}`}
              positions={route.coords}
              color={route.color}
              weight={5}
              opacity={0.75}
            />
          ))}

          {techsWithCoords.map((tech) => (
            <Marker key={`tech-${tech.id}`} position={[tech.lat, tech.lng]} icon={createTechIcon(tech.name, tech.status)}>
              <Popup>
                <div className="text-sm">
                  <strong>{tech.name}</strong>
                  <br />
                  Status: {tech.status}
                  <br />
                  Coordinates: {tech.lat.toFixed(6)}, {tech.lng.toFixed(6)}
                  <br />
                  {formatLastSeen(tech.lastLocationUpdate)}
                </div>
              </Popup>
            </Marker>
          ))}

          {ticketsWithCoords.map((ticket) => (
            <Marker key={`ticket-${ticket.id}`} position={[ticket.lat, ticket.lng]} icon={ticketIcon}>
              <Popup>
                <div className="text-sm">
                  <strong>{formatTicketId(ticket.id)}</strong>
                  <br />
                  {ticket.client} / {ticket.service}
                  <br />
                  {ticket.locationDesc || 'No landmark provided'}
                  {ticket.technicianName && (
                    <>
                      <br />
                      Technician: {ticket.technicianName}
                    </>
                  )}
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
        <div className="absolute left-4 top-4 rounded-xl border bg-white/90 p-4 shadow-lg backdrop-blur">
          <div className="font-medium text-slate-900">Live tracking</div>
          <div className="text-sm text-slate-600">
            {filteredTechs.length}/{trackData.techMarkers.length} technicians visible
          </div>
          <div className="text-sm text-slate-600">{activeRoutes.length} route{activeRoutes.length === 1 ? '' : 's'} to clients</div>
        </div>
      </div>

      {activeRoutes.length > 0 && (
        <div className="mt-4 rounded-xl bg-white p-4 shadow-sm">
          <h3 className="mb-3 text-lg font-semibold">Technicians En Route</h3>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {activeRoutes.map(({ ticket, tech }) => (
              <button
                type="button"
                key={`active-route-${ticket.id}`}
                onClick={() =>
                  focusLocation({
                    kind: 'ticket',
                    id: ticket.id,
                    label: formatTicketId(ticket.id),
                    lat: ticket.lat,
                    lng: ticket.lng,
                    zoom: 14
                  })
                }
                className="rounded-lg border border-slate-200 p-3 text-left transition hover:border-blue-300 hover:bg-blue-50"
              >
                <div className="font-semibold text-slate-900">{tech.name} to {formatTicketId(ticket.id)}</div>
                <div className="mt-1 text-sm text-slate-600">{ticket.client} / {ticket.service}</div>
                <div className="mt-2 flex flex-wrap gap-2 text-xs">
                  <span className="rounded-full bg-blue-50 px-2 py-1 font-medium text-blue-700">{formatDistance(ticket.routeDistance)}</span>
                  <span className="rounded-full bg-emerald-50 px-2 py-1 font-medium text-emerald-700">{formatDuration(ticket.routeDuration)}</span>
                  <span className="rounded-full bg-slate-100 px-2 py-1 font-medium text-slate-600">{formatLastSeen(tech.lastLocationUpdate)}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl bg-white p-4 shadow-sm">
          <h3 className="mb-2 text-lg font-semibold">Technicians</h3>
          {filteredTechs.length ? (
            <ul className="space-y-2 text-sm">
              {filteredTechs.map((tech) => {
                const isFocused = focusedTarget?.kind === 'tech' && focusedTarget.id === tech.id;
                const techHasCoords = hasCoords(tech);
                return (
                  <li
                    key={tech.id}
                    className={`rounded border p-3 ${isFocused ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-300' : 'border-slate-200'}`}
                  >
                    <div className="font-medium">{tech.name}</div>
                    <div>Status: {tech.status}</div>
                    <div>
                      Lat/Lng: {Number.isFinite(tech.lat) ? tech.lat.toFixed(6) : 'N/A'},{' '}
                      {Number.isFinite(tech.lng) ? tech.lng.toFixed(6) : 'N/A'}
                    </div>
                    <div className="mt-2 flex gap-2">
                      <button
                        onClick={() =>
                          focusLocation({
                            kind: 'tech',
                            id: tech.id,
                            label: tech.name,
                            lat: tech.lat,
                            lng: tech.lng,
                            zoom: 16
                          })
                        }
                        disabled={!techHasCoords}
                        title={techHasCoords ? `Center the map on ${tech.name}` : `${tech.name} has no live coordinates yet`}
                        className={`rounded px-3 py-1.5 text-white ${
                          isFocused ? 'bg-blue-800' : 'bg-blue-600'
                        } disabled:cursor-not-allowed disabled:bg-slate-300`}
                      >
                        {techHasCoords ? (isFocused ? 'Centered on map' : 'Center map here') : 'Coordinates unavailable'}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">No technicians found with the selected status.</p>
          )}
        </div>

        <div className="rounded-xl bg-white p-4 shadow-sm">
          <h3 className="mb-2 text-lg font-semibold">Open Tickets (with location info)</h3>
          {openTickets.length ? (
            <ul className="space-y-2 text-sm">
              {openTickets.map((ticket) => {
                const isFocused = focusedTarget?.kind === 'ticket' && focusedTarget.id === ticket.id;
                const ticketHasCoords = hasCoords(ticket);
                return (
                  <li
                    key={ticket.id}
                    className={`rounded border p-3 ${isFocused ? 'border-indigo-500 bg-indigo-50 ring-1 ring-indigo-300' : 'border-slate-200'}`}
                  >
                    <div className="font-medium">
                      {formatTicketId(ticket.id)}: {ticket.client} / {ticket.service}
                    </div>
                    <div>
                      Lat/Lng: {Number.isFinite(ticket.lat) ? ticket.lat.toFixed(6) : 'N/A'},{' '}
                      {Number.isFinite(ticket.lng) ? ticket.lng.toFixed(6) : 'N/A'}
                    </div>
                    <div>Landmark/Desc: {ticket.locationDesc || 'Not provided'}</div>
                    <div>Status: {ticket.status}</div>
                    <div className="mt-2 flex gap-2">
                      <button
                        onClick={() =>
                          focusLocation({
                            kind: 'ticket',
                            id: ticket.id,
                            label: formatTicketId(ticket.id),
                            lat: ticket.lat,
                            lng: ticket.lng,
                            zoom: 15
                          })
                        }
                        disabled={!ticketHasCoords}
                        title={ticketHasCoords ? `Center the map on ${formatTicketId(ticket.id)}` : `${formatTicketId(ticket.id)} has no coordinates yet`}
                        className={`rounded px-3 py-1.5 text-white ${
                          isFocused ? 'bg-indigo-800' : 'bg-indigo-600'
                        } disabled:cursor-not-allowed disabled:bg-slate-300`}
                      >
                        {ticketHasCoords ? (isFocused ? 'Centered on map' : 'Center map here') : 'Coordinates unavailable'}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">No active tickets to show.</p>
          )}
        </div>
      </div>
    </Layout>
  );
}
