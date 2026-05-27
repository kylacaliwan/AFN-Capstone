import { useEffect, useMemo, useState } from 'react';
import Layout from '../../components/layout/Layout';
import { MapContainer, TileLayer, Circle, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { FiFilter, FiMap, FiRefreshCw, FiUsers } from 'react-icons/fi';
import { fetchCoverageHeatmap, fetchTechnicianCoverage } from '../../api/api';
import {
  CALABARZON_BOUNDS,
  CALABARZON_CENTER,
  CALABARZON_MIN_ZOOM,
  MAP_ATTRIBUTION,
  MAP_TILE_URL
} from '../../utils/mapRegion';

const TECH_COLORS = ['#2563eb', '#0f766e', '#7c3aed', '#ea580c', '#be123c', '#0891b2'];

function MapResizeController({ mapCenter, points }) {
  const map = useMap();

  useEffect(() => {
    const timer = window.setTimeout(() => {
      map.invalidateSize();

      if (points.length > 1) {
        map.fitBounds(points, { padding: [28, 28], maxZoom: 12 });
      } else {
        map.setView(mapCenter, 11);
      }
    }, 80);

    return () => window.clearTimeout(timer);
  }, [map, mapCenter, points]);

  return null;
}

const getServiceBreakdown = (point) => {
  if (Array.isArray(point?.service_breakdown) && point.service_breakdown.length > 0) {
    return point.service_breakdown;
  }

  return Array.isArray(point?.service_types)
    ? point.service_types.map((name) => ({ name, count: 1 }))
    : [];
};

export default function CoverageHeatmap() {
  const [heatmapData, setHeatmapData] = useState([]);
  const [technicianCoverage, setTechnicianCoverage] = useState([]);
  const [clientOptions, setClientOptions] = useState([]);
  const [technicianOptions, setTechnicianOptions] = useState([]);
  const [serviceOptions, setServiceOptions] = useState([]);
  const [selectedClient, setSelectedClient] = useState('');
  const [selectedTechnician, setSelectedTechnician] = useState('');
  const [selectedServiceType, setSelectedServiceType] = useState('');
  const [showServiceDensity, setShowServiceDensity] = useState(true);
  const [showTechnicianCoverage, setShowTechnicianCoverage] = useState(true);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ totalPoints: 0, maxDensity: 0, totalTechnicians: 0 });
  const [error, setError] = useState('');
  const boundedHeatmapData = heatmapData.filter((point) => CALABARZON_BOUNDS.contains([point.lat, point.lng]));
  const boundedTechnicianCoverage = technicianCoverage.filter((tech) => CALABARZON_BOUNDS.contains(tech.center));
  const mapPoints = useMemo(
    () => [
      ...boundedHeatmapData.map((point) => [point.lat, point.lng]),
      ...boundedTechnicianCoverage.map((tech) => tech.center)
    ],
    [boundedHeatmapData, boundedTechnicianCoverage]
  );
  const mapCenter = boundedHeatmapData.length > 0
    ? [boundedHeatmapData[0].lat, boundedHeatmapData[0].lng]
    : boundedTechnicianCoverage.length > 0
      ? boundedTechnicianCoverage[0].center
      : CALABARZON_CENTER;
  const serviceSummary = useMemo(() => {
    const totals = {};

    boundedHeatmapData.forEach((point) => {
      getServiceBreakdown(point).forEach((service) => {
        totals[service.name] = (totals[service.name] || 0) + Number(service.count || 0);
      });
    });

    return Object.entries(totals)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [boundedHeatmapData]);

  useEffect(() => {
    loadHeatmapData();
  }, [selectedClient, selectedTechnician, selectedServiceType]);

  const loadHeatmapData = async () => {
    setLoading(true);
    try {
      const filters = {
        client: selectedClient,
        technician: selectedTechnician,
        serviceType: selectedServiceType
      };
      const [heatmapResponse, coverageResponse] = await Promise.all([
        fetchCoverageHeatmap(filters),
        fetchTechnicianCoverage(filters)
      ]);

      setHeatmapData(heatmapResponse.heatmap_data || []);
      setTechnicianCoverage(coverageResponse.coverage_areas || []);
      setClientOptions(heatmapResponse.client_options || []);
      setTechnicianOptions(heatmapResponse.technician_options || coverageResponse.coverage_areas?.map((tech) => ({
        id: tech.technician_id,
        name: tech.name
      })) || []);
      setServiceOptions(heatmapResponse.service_options || []);
      setStats({
        totalPoints: heatmapResponse.total_points || 0,
        maxDensity: heatmapResponse.max_density || 0,
        totalTechnicians: coverageResponse.total_technicians || 0
      });
      setError('');
    } catch (error) {
      setHeatmapData([]);
      setTechnicianCoverage([]);
      setServiceOptions([]);
      setStats({ totalPoints: 0, maxDensity: 0, totalTechnicians: 0 });
      setError(error.message || 'Unable to load coverage heatmap.');
    }
    setLoading(false);
  };

  const resetFilters = () => {
    setSelectedClient('');
    setSelectedTechnician('');
    setSelectedServiceType('');
  };

  const getHeatmapColor = (count, maxDensity) => {
    if (!maxDensity) return '#64748b';
    const intensity = count / maxDensity;
    if (intensity > 0.8) return '#dc2626'; // Red for high density
    if (intensity > 0.6) return '#ea580c'; // Orange
    if (intensity > 0.4) return '#ca8a04'; // Yellow
    if (intensity > 0.2) return '#16a34a'; // Green
    return '#22c55e'; // Light green for low density
  };

  const getHeatmapRadius = (count) => {
    return Math.max(20, Math.min(50, count * 2)); // Scale radius based on count
  };

  const getTechnicianColor = (technicianId, index) => {
    const numericId = Number(technicianId);
    const colorIndex = Number.isFinite(numericId) ? numericId % TECH_COLORS.length : index % TECH_COLORS.length;
    return TECH_COLORS[colorIndex];
  };

  return (
    <Layout>
      {error && <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>}

      <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
          <FiFilter className="text-slate-500" />
          Filters
        </div>
        <div className="grid gap-3 lg:grid-cols-[1fr_1fr_1fr_auto]">
          <label className="text-sm">
            <span className="mb-1 block font-medium text-slate-700">Client</span>
            <select
              value={selectedClient}
              onChange={(event) => setSelectedClient(event.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
            >
              <option value="">All clients</option>
              {clientOptions.map((client) => (
                <option key={client.id} value={client.id}>{client.name}</option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium text-slate-700">Technician</span>
            <select
              value={selectedTechnician}
              onChange={(event) => setSelectedTechnician(event.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
            >
              <option value="">All technicians</option>
              {technicianOptions.map((technician) => (
                <option key={technician.id} value={technician.id}>{technician.name}</option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium text-slate-700">Service</span>
            <select
              value={selectedServiceType}
              onChange={(event) => setSelectedServiceType(event.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
            >
              <option value="">All services</option>
              {serviceOptions.map((service) => (
                <option key={service.id} value={service.id}>{service.name}</option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={resetFilters}
            className="self-end rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Reset
          </button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-sm">
          <label className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2">
            <input
              type="checkbox"
              checked={showServiceDensity}
              onChange={(event) => setShowServiceDensity(event.target.checked)}
            />
            Completed service density
          </label>
          <label className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2">
            <input
              type="checkbox"
              checked={showTechnicianCoverage}
              onChange={(event) => setShowTechnicianCoverage(event.target.checked)}
            />
            Technician coverage
          </label>
          <button
            type="button"
            onClick={loadHeatmapData}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-slate-700 hover:bg-slate-50"
          >
            <FiRefreshCw size={14} />
            Refresh
          </button>
        </div>
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-xl border border-blue-100 bg-blue-50 p-4">
          <div className="text-2xl font-bold text-blue-700">{stats.totalPoints}</div>
          <div className="text-sm font-medium text-blue-900">Service Areas</div>
        </div>
        <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4">
          <div className="text-2xl font-bold text-emerald-700">{stats.maxDensity}</div>
          <div className="text-sm font-medium text-emerald-900">Max Density</div>
        </div>
        <div className="rounded-xl border border-violet-100 bg-violet-50 p-4">
          <div className="text-2xl font-bold text-violet-700">{stats.totalTechnicians}</div>
          <div className="text-sm font-medium text-violet-900">Active Technicians</div>
        </div>
      </div>

      <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-2 text-sm font-semibold text-slate-900">Services Per Area</div>
        {serviceSummary.length ? (
          <div className="flex flex-wrap gap-2">
            {serviceSummary.map((service) => (
              <span
                key={service.name}
                className="rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700"
              >
                {service.name}: {service.count}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-500">
            No completed service locations are available for the selected filters.
          </p>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <div className="flex h-[min(68vh,720px)] min-h-[520px] items-center justify-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
          </div>
        ) : (
          <div className="h-[min(68vh,720px)] min-h-[520px]">
            <MapContainer
              center={mapCenter}
              zoom={11}
              minZoom={CALABARZON_MIN_ZOOM}
              maxBounds={CALABARZON_BOUNDS}
              maxBoundsViscosity={1.0}
              className="h-full w-full"
            >
              <MapResizeController mapCenter={mapCenter} points={mapPoints} />
              <TileLayer url={MAP_TILE_URL} attribution={MAP_ATTRIBUTION} />

              {showServiceDensity && boundedHeatmapData.map((point, index) => {
                const serviceBreakdown = getServiceBreakdown(point);

                return (
                  <Circle
                    key={`heatmap-${index}`}
                    center={[point.lat, point.lng]}
                    radius={getHeatmapRadius(point.count) * 10}
                    pathOptions={{
                      color: getHeatmapColor(point.count, stats.maxDensity),
                      fillColor: getHeatmapColor(point.count, stats.maxDensity),
                      fillOpacity: 0.55,
                      weight: 2
                    }}
                  >
                    <Popup>
                      <div className="min-w-[220px] text-left text-sm">
                        <strong>Service Hotspot</strong>
                        <div className="mt-1 text-slate-700">{point.address || 'Mapped service area'}</div>
                        <div className="mt-2 font-semibold text-slate-900">
                          {point.count} completed service{point.count === 1 ? '' : 's'}
                        </div>
                        <div className="mt-2">
                          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Services Completed Here</div>
                          <ul className="mt-1 space-y-1">
                            {serviceBreakdown.map((service) => (
                              <li key={service.name} className="flex items-center justify-between gap-3">
                                <span>{service.name}</span>
                                <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700">
                                  {service.count}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>
                        {Array.isArray(point.status_breakdown) && point.status_breakdown.length > 0 && (
                          <div className="mt-2">
                            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Status Mix</div>
                            <ul className="mt-1 space-y-1">
                              {point.status_breakdown.map((statusItem) => (
                                <li key={statusItem.name} className="flex items-center justify-between gap-3">
                                  <span>{statusItem.name}</span>
                                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                                    {statusItem.count}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        <div className="mt-2 text-xs text-slate-500">
                          Clients: {(point.clients || []).map((client) => client.name).join(', ') || 'n/a'}
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          Technicians: {(point.technicians || []).map((tech) => tech.name).join(', ') || 'n/a'}
                        </div>
                      </div>
                    </Popup>
                  </Circle>
                );
              })}

              {showTechnicianCoverage && boundedTechnicianCoverage.map((tech, index) => {
                const color = getTechnicianColor(tech.technician_id, index);
                return (
                  <Circle
                    key={`coverage-${index}`}
                    center={tech.center}
                    radius={tech.radius_km * 1000}
                    pathOptions={{
                      color,
                      fillColor: color,
                      fillOpacity: 0.1,
                      weight: 2,
                      dashArray: '5, 5'
                    }}
                  >
                    <Popup>
                      <div className="text-center">
                        <strong>{tech.name}</strong><br />
                        Coverage Area: {tech.radius_km} km radius
                      </div>
                    </Popup>
                  </Circle>
                );
              })}
            </MapContainer>
          </div>
        )}
      </div>

      <div className="mt-4 rounded-xl bg-slate-50 p-4">
        <h4 className="font-semibold mb-3 text-slate-800">Map Legend</h4>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full bg-red-600"></div>
            <span>High Density (80%+)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full bg-orange-600"></div>
            <span>Medium-High (60-80%)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full bg-yellow-600"></div>
            <span>Medium (40-60%)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full bg-green-600"></div>
            <span>Low Density (20-40%)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full bg-green-400"></div>
            <span>Very Low Density</span>
          </div>
        </div>
        <div className="mt-3 pt-3 border-t border-slate-200">
          <div className="flex flex-wrap gap-4 text-sm">
            {boundedTechnicianCoverage.length ? boundedTechnicianCoverage.map((tech, index) => {
              const color = getTechnicianColor(tech.technician_id, index);
              return (
                <div key={tech.technician_id} className="flex items-center gap-2">
                  <div
                    className="w-4 h-4 rounded-full border-2 border-dashed"
                    style={{ borderColor: color, backgroundColor: `${color}22` }}
                  ></div>
                  <span>{tech.name} coverage</span>
                </div>
              );
            }) : (
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-blue-500 border-dashed rounded-full bg-blue-50"></div>
                <span>Technician Coverage Areas</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
