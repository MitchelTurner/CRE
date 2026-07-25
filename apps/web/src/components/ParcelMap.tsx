import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { MapPoint } from '../lib/types';

const GREENVILLE: L.LatLngExpression = [34.85, -82.4];

const pinIcon = (active: boolean, score: number | null) => {
  const color = active ? '#e0b85a' : '#c6f07a';
  const size = active ? 16 : 10 + Math.min(8, (score ?? 0) / 20);
  return L.divIcon({
    className: '',
    html: `<span style="
      display:block;width:${size}px;height:${size}px;border-radius:999px;
      background:${color};border:2px solid rgba(255,255,255,${active ? 0.9 : 0.35});
      box-shadow:0 0 0 1px rgba(0,0,0,0.35);
    "></span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
};

export function ParcelMap({
  items,
  selectedPin,
  onSelect,
}: {
  items: MapPoint[];
  selectedPin: string | null;
  onSelect: (pin: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      zoomControl: true,
      attributionControl: true,
    }).setView(GREENVILLE, 11);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap &copy; CARTO',
      subdomains: 'abcd',
      maxZoom: 19,
    }).addTo(map);

    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    const onResize = () => map.invalidateSize();
    window.setTimeout(onResize, 50);
    window.addEventListener('resize', onResize);

    return () => {
      window.removeEventListener('resize', onResize);
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
      markersRef.current.clear();
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;

    layer.clearLayers();
    markersRef.current.clear();

    const latLngs: L.LatLngExpression[] = [];
    for (const p of items) {
      if (p.latitude == null || p.longitude == null) continue;
      const latLng: L.LatLngExpression = [p.latitude, p.longitude];
      latLngs.push(latLng);
      const marker = L.marker(latLng, {
        icon: pinIcon(p.pin === selectedPin, p.score),
        title: `${p.situsAddress || p.pin} · ${p.score ?? '—'}`,
      });
      marker.on('click', () => onSelect(p.pin));
      marker.addTo(layer);
      markersRef.current.set(p.pin, marker);
    }

    if (latLngs.length > 1) {
      map.fitBounds(L.latLngBounds(latLngs), { padding: [36, 36], maxZoom: 14 });
    } else if (latLngs.length === 1) {
      map.setView(latLngs[0]!, 14);
    } else {
      map.setView(GREENVILLE, 11);
    }

    window.setTimeout(() => map.invalidateSize(), 40);
  }, [items, onSelect]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    for (const [pin, marker] of markersRef.current) {
      const point = items.find((i) => i.pin === pin);
      marker.setIcon(pinIcon(pin === selectedPin, point?.score ?? null));
    }
    if (selectedPin) {
      const marker = markersRef.current.get(selectedPin);
      if (marker) {
        map.panTo(marker.getLatLng(), { animate: true });
      }
    }
  }, [selectedPin, items]);

  return (
    <div
      ref={containerRef}
      className="border-pine/40 z-0 h-[min(70vh,560px)] w-full overflow-hidden border"
      role="img"
      aria-label="Parcel map"
    />
  );
}
