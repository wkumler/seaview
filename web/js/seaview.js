// Cruise support map. Rebuilt from the folium-generated page at cruise.bror.co;
// everything cruise-specific lives in site_config.json and layer_config.json.
(function () {
    'use strict';

    function fetchJSON(url) {
        return fetch(url, {cache: 'no-cache'}).then(function (r) {
            if (!r.ok) throw new Error(url + ': ' + r.status + ' ' + r.statusText);
            return r.json();
        });
    }

    function resolveUrl(url) {
        return new URL(url, document.baseURI).href;
    }

    // --- Station layers ----------------------------------------------------

    function formatLatLng(latLng) {
        return Math.abs(latLng[0]).toFixed(3) + '°' + (latLng[0] < 0 ? 'S' : 'N') + ', ' +
               Math.abs(latLng[1]).toFixed(3) + '°' + (latLng[1] < 0 ? 'W' : 'E');
    }

    // Only fields that have a value are shown.
    function stationPopupHtml(p, latLng) {
        var html = '<b>Station:</b> ' + (p.name || 'Station') + '<br>' +
                   '<b>Position:</b> ' + formatLatLng(latLng) + '<br>';
        if (p.arrive) html += '<b>Arrival:</b> ' + p.arrive + '<br>';
        if (p.departure) html += '<b>Departure:</b> ' + p.departure + '<br>';
        if (p.depth) html += '<b>Depth:</b> ' + p.depth + '<br>';
        if (p.duration) html += '<b>Duration:</b> ' + p.duration + '<br>';
        if (p.comments) html += '<b>Comments:</b> ' + p.comments + '<br>';
        return html;
    }

    function stationLayer(cruise) {
        var group = L.featureGroup();
        fetchJSON(cruise.stations).then(function (data) {
            var coords = [];
            data.features.forEach(function (feature) {
                var c = feature.geometry.coordinates;
                var latLng = [c[1], c[0]];
                var p = feature.properties || {};
                coords.push(latLng);
                L.circleMarker(latLng, {
                    color: cruise.color, fillColor: cruise.color,
                    weight: 3, opacity: 1, fillOpacity: 0.6, radius: 8
                })
                    .bindTooltip((p.name || 'Station') + (p.arrive ? ' - ' + p.arrive : ''))
                    .bindPopup(stationPopupHtml(p, latLng), {maxWidth: 300})
                    .addTo(group);
            });
            if (coords.length > 1) {
                // Not interactive, so clicks on a station go to its marker rather than the line.
                L.polyline(coords, {
                    color: cruise.line_color || 'blue', weight: 2, opacity: 0.5, interactive: false
                }).addTo(group);
            }
        }).catch(function (err) {
            console.error('[Stations] ' + cruise.name, err);
        });
        return group;
    }

    // --- EEZ boundaries (large file, loaded on first use) -------------------

    function eezLayer(url) {
        var layer = L.geoJson(null, {
            pane: 'eez',
            style: function () {
                return {color: '#3388ff', fillColor: '#3388ff', fillOpacity: 0.1, opacity: 0.4, weight: 2};
            }
        });
        layer.bindTooltip(function (l) {
            return '<table><tr><th>Country</th><td>' + (l.feature.properties.Country || '') + '</td></tr></table>';
        }, {sticky: true, className: 'foliumtooltip'});
        var loaded = false;
        layer.on('add', function () {
            if (loaded) return;
            loaded = true;
            fetchJSON(url).then(function (data) { layer.addData(data); })
                .catch(function (err) { loaded = false; console.error('[EEZ]', err); });
        });
        return layer;
    }

    // --- Ship tracker ------------------------------------------------------

    function boatIcon(heading, color) {
        return L.divIcon({
            className: 'boat-marker',
            html: '<div style="transform: rotate(' + heading + 'deg); transform-origin: center;">' +
                  '<svg width="40" height="40" viewBox="0 0 40 40" style="overflow: visible;">' +
                  '<path d="M 20 6 L 27 26 L 20 32 L 13 26 Z" fill="' + color + '" stroke="white" stroke-width="2" opacity="0.95"/>' +
                  '<circle cx="20" cy="6" r="3" fill="white" stroke="' + color + '" stroke-width="1.5"/>' +
                  '<line x1="16" y1="18" x2="24" y2="18" stroke="white" stroke-width="1.5" opacity="0.7"/>' +
                  '<line x1="17" y1="23" x2="23" y2="23" stroke="white" stroke-width="1.5" opacity="0.7"/>' +
                  '</svg></div>',
            iconSize: [40, 40],
            iconAnchor: [20, 20]
        });
    }

    function shipLayers(ship) {
        var factor = ship.speed_to_knots || 1;
        var track = L.realtime({url: ship.track_url, crossOrigin: true, type: 'json'}, {
            interval: ship.interval_ms,
            getFeatureId: function () { return 'track'; },
            style: function () {
                return {color: '#aaa', weight: 2, opacity: 0.7, lineJoin: 'round', lineCap: 'round'};
            },
            onEachFeature: function (feature, layer) {
                layer.bindTooltip(ship.name + ' Track');
            }
        });

        var position = L.realtime({url: ship.latest_url, crossOrigin: true, type: 'json'}, {
            interval: ship.interval_ms,
            getFeatureId: function (feature) { return feature.properties._endpoint || 'vessel'; },
            pointToLayer: function (feature, latlng) {
                var speed = (feature.properties.speed || 0) * factor;
                var color = '#d30000';                                    // stopped
                if (speed > 0 && speed < ship.moving_knots) color = '#ffa500'; // slow
                else if (speed >= ship.moving_knots) color = '#008000';      // underway
                return L.marker(latlng, {icon: boatIcon(feature.properties.heading || 0, color)});
            },
            onEachFeature: function (feature, layer) {
                var p = feature.properties;
                var speed = (p.speed || 0) * factor;
                var heading = p.heading || 0;
                var status = p.speed ? '🟢 Moving' : '🔴 Stopped';
                var row = function (k, v, style) {
                    return '<tr><td style="padding: 4px; font-weight: bold;">' + k + '</td>' +
                           '<td style="padding: 4px;' + (style || '') + '">' + v + '</td></tr>';
                };
                layer.bindPopup(
                    '<div style="font-family: Arial, sans-serif; min-width: 200px;">' +
                    '<h4 style="margin: 0 0 10px 0;">' + ship.name + '</h4>' +
                    '<table style="width: 100%; border-collapse: collapse;">' +
                    row('Status:', status) +
                    row('Speed:', speed.toFixed(2) + ' knots') +
                    row('Heading:', heading.toFixed(2) + '°') +
                    row('Time:', new Date(p.influxtime).toLocaleString(), ' font-size: 11px;') +
                    '</table></div>');
                layer.bindTooltip('Speed: ' + speed.toFixed(1) + ' knots | Heading: ' + heading.toFixed(0) + '°');
            }
        });
        return {track: track, position: position};
    }

    // --- Colorbar legend ---------------------------------------------------

    function colorbarLayer(map, colorbars) {
        var box = L.DomUtil.create('div', 'colorbar-box hidden', map.getContainer());
        box.innerHTML = '<div class="colorbar-box-title">Legend</div><div class="colorbar-box-content">' +
            colorbars.map(function (c) {
                return '<div class="colorbar-container"><img src="' + c.src + '" alt="' + c.alt + '" title="' + c.alt +
                       '" onerror="this.parentNode.hidden = true"></div>';
            }).join('') + '</div>';
        L.DomEvent.disableClickPropagation(box);
        L.DomEvent.disableScrollPropagation(box);
        var layer = L.layerGroup();
        layer.on('add', function () { box.classList.remove('hidden'); });
        layer.on('remove', function () { box.classList.add('hidden'); });
        return layer;
    }

    // --- Date-grouped satellite layers from layer_config.json --------------

    function dateRange(start, end) {
        var dates = [];
        var d = new Date(start + 'T00:00:00Z'), d2 = new Date(end + 'T00:00:00Z');
        for (; d <= d2; d.setUTCDate(d.getUTCDate() + 1)) {
            dates.push(d.toISOString().slice(0, 10));
        }
        return dates;
    }

    // Each cruise has its own tile set (layer_config/<cruise>.json). The date panel lists every
    // product and date found in any cruise; a ticked date is drawn for every cruise whose station
    // layer is switched on. All cruises share one colour scale, so overlapping tiles agree.
    function dynamicLayers(map, cruises, refreshMs) {
        var dateGroups = {}, tiles = [], control = null;

        // Show or hide each cruise's tiles to match its station layer.
        function sync() {
            tiles.forEach(function (t) {
                var group = dateGroups[t.key];
                if (map.hasLayer(t.cruise.layer)) group.addLayer(t.layer);
                else group.removeLayer(t.layer);
            });
        }

        function update(configs) {
            var selected = new Set(Object.keys(dateGroups).filter(function (k) { return map.hasLayer(dateGroups[k]); }));
            Object.values(dateGroups).forEach(function (g) { map.removeLayer(g); });
            if (control) map.removeControl(control);
            dateGroups = {};
            tiles = [];

            var products = {};  // id -> {name, dates: Set}, in first-seen order
            configs.forEach(function (entry) {
                var config = entry.config;
                // base_url may be absolute or relative to the page
                var baseUrl = resolveUrl(config.base_url.replace(/\/+$/, '') + '/');
                config.layers.forEach(function (lc) {
                    var product = products[lc.id] = products[lc.id] || {name: lc.name, dates: new Set()};
                    (lc.dates || dateRange(lc.date_range.start, lc.date_range.end)).forEach(function (date) {
                        product.dates.add(date);
                        var url = lc.url_template.replace('{base_url}/', baseUrl).replace('{base_url}', baseUrl)
                                                 .replace('{date}', date);
                        tiles.push({cruise: entry.cruise, key: lc.id + '_' + date, layer: L.tileLayer(url, {
                            attribution: lc.attribution, opacity: 0.7,
                            // Past the deepest generated zoom, stretch those tiles instead of going blank.
                            maxNativeZoom: config.max_native_zoom || 10,
                            bounds: config.bounds
                        })});
                    });
                });
            });

            var grouped = {};
            Object.keys(products).forEach(function (id) {
                grouped[products[id].name] = {};
                Array.from(products[id].dates).sort().forEach(function (date) {
                    var key = id + '_' + date;
                    dateGroups[key] = L.layerGroup();
                    grouped[products[id].name][date] = dateGroups[key];
                });
            });
            sync();

            control = L.control.groupedLayers(null, grouped, {collapsed: false, position: 'topleft'}).addTo(map);
            Object.keys(dateGroups).forEach(function (k) { if (selected.has(k)) dateGroups[k].addTo(map); });

            var el = control.getContainer();
            var link = L.DomUtil.create('a', 'layer-refresh-link', el);
            link.textContent = '🔄 Refresh layers';
            link.href = '#';
            L.DomEvent.on(link, 'click', function (e) { L.DomEvent.preventDefault(e); load(); });
        }

        function load() {
            // A cruise whose layer list is missing (no tiles yet) is skipped, not fatal.
            Promise.all(cruises.map(function (c) {
                return fetchJSON(c.layer_config + '?t=' + Date.now())
                    .then(function (config) { return {cruise: c, config: config}; })
                    .catch(function (err) { console.warn('[DynamicLayers] ' + c.name, err.message); return null; });
            })).then(function (results) {
                update(results.filter(Boolean));
            });
        }

        map.on('overlayadd overlayremove', function (e) {
            if (cruises.some(function (c) { return c.layer === e.layer; })) sync();
        });
        load();
        if (refreshMs > 0) setInterval(load, refreshMs);
        window.refreshDynamicLayers = load;
    }

    // --- Map ---------------------------------------------------------------

    function init(cfg) {
        if (cfg.title) document.title = cfg.title;

        var map = L.map('map', {center: cfg.map.center, zoom: cfg.map.zoom, maxZoom: cfg.map.max_zoom || 12,
                                zoomControl: true});
        // Grid lines and EEZ polygons get their own panes between the satellite tiles (200) and
        // the station layers (overlayPane, 400), so stations stay on top and clickable no matter
        // in which order layers are switched on or redrawn.
        map.createPane('graticule').style.zIndex = 350;
        map.createPane('eez').style.zIndex = 360;
        window.seaviewMap = map;
        L.control.scale().addTo(map);

        var basemaps = {};
        cfg.basemaps.forEach(function (b, i) {
            var layer = L.tileLayer(b.url, {
                attribution: b.attribution, minZoom: 0,
                maxZoom: cfg.map.max_zoom || 12, maxNativeZoom: b.maxNativeZoom || 18
            });
            basemaps[b.name] = layer;
            if (b.default || (i === 0 && !cfg.basemaps.some(function (x) { return x.default; }))) layer.addTo(map);
        });

        new L.Control.MousePosition({
            position: 'bottomright', separator: ' : ', emptyString: 'Unavailable',
            lngFirst: false, numDigits: 5, prefix: ''
        }).addTo(map);
        L.control.fullscreen({position: 'topright', title: 'Full Screen', titleCancel: 'Exit', forceSeparateButton: true}).addTo(map);

        L.graticule({
            interval: [{interval: 30, start: 0}, {interval: 15, start: 3}, {interval: 10, start: 5},
                       {interval: 5, start: 7}, {interval: 2, start: 9}, {interval: 1, start: 11}],
            pane: 'graticule', interactive: false,
            showLabel: true, opacity: 1.0, weight: 0.8, color: '#666',
            font: '12px Verdana', fontColor: '#111', zoneLabel: false, sphere: false
        }).addTo(map);

        L.control.ruler({
            position: 'topright',
            lengthUnit: {display: 'nm', decimal: 2, factor: 0.539957, label: 'Distance:'},
            angleUnit: {display: '&deg;', decimal: 2, label: 'Bearing:'}
        }).addTo(map);

        var overlays = {};
        if (cfg.eez) overlays['EEZ Boundaries'] = eezLayer(cfg.eez);
        overlays['Night/Day'] = L.terminator().addTo(map);
        var tiledCruises = [];
        (cfg.cruises || []).forEach(function (c) {
            var layer = stationLayer(c);
            if (c.visible !== false) layer.addTo(map);
            overlays[c.name] = layer;
            if (c.layer_config) tiledCruises.push({name: c.name, layer: layer, layer_config: c.layer_config});
        });
        if (cfg.ship) {
            var ship = shipLayers(cfg.ship);
            overlays['Ship Track (Historical)'] = ship.track.addTo(map);
            overlays['Real-time Position'] = ship.position.addTo(map);
        }
        if (cfg.colorbars && cfg.colorbars.length) overlays['Colorbars'] = colorbarLayer(map, cfg.colorbars).addTo(map);

        // A base map picker is only useful when there is more than one base map.
        var baseChoices = Object.keys(basemaps).length > 1 ? basemaps : {};
        L.control.layers(baseChoices, overlays, {position: 'topright', collapsed: false, autoZIndex: true}).addTo(map);

        if (tiledCruises.length) dynamicLayers(map, tiledCruises, cfg.layer_refresh_ms || 0);
    }

    fetchJSON('site_config.json').then(init).catch(function (err) {
        console.error('[seaview] failed to load site_config.json', err);
        document.getElementById('map').textContent = 'Failed to load site_config.json: ' + err.message;
    });
})();
