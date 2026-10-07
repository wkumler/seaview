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

    function stationPopupHtml(p) {
        var html = '<b>Station:</b> ' + (p.name || 'N/A') + '<br>' +
                   '<b>Arrival:</b> ' + (p.arrive || 'N/A') + '<br>' +
                   '<b>Departure:</b> ' + (p.departure || 'N/A') + '<br>';
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
                    .bindTooltip((p.name || 'Station') + ' - ' + (p.arrive || 'N/A'))
                    .bindPopup(stationPopupHtml(p), {maxWidth: 300})
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
                return '<div class="colorbar-container"><img src="' + c.src + '" alt="' + c.alt + '" title="' + c.alt + '"></div>';
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

    function dynamicLayers(map, configUrl, refreshMs) {
        var layers = {}, control = null;

        function update(config) {
            var visible = new Set(Object.keys(layers).filter(function (k) { return map.hasLayer(layers[k]); }));
            Object.values(layers).forEach(function (l) { map.removeLayer(l); });
            if (control) map.removeControl(control);
            layers = {};

            // base_url may be absolute or relative to the page
            var baseUrl = resolveUrl(config.base_url.replace(/\/+$/, '') + '/');
            var grouped = {};
            config.layers.forEach(function (lc) {
                grouped[lc.name] = {};
                dateRange(lc.date_range.start, lc.date_range.end).forEach(function (date) {
                    var url = lc.url_template.replace('{base_url}/', baseUrl).replace('{base_url}', baseUrl)
                                             .replace('{date}', date);
                    var key = lc.id + '_' + date;
                    layers[key] = L.tileLayer(url, {attribution: lc.attribution, opacity: 0.7});
                    grouped[lc.name][date] = layers[key];
                });
            });

            control = L.control.groupedLayers(null, grouped, {collapsed: false, position: 'topleft'}).addTo(map);
            Object.keys(layers).forEach(function (k) { if (visible.has(k)) layers[k].addTo(map); });

            var el = control.getContainer();
            var link = L.DomUtil.create('a', 'layer-refresh-link', el);
            link.textContent = '🔄 Refresh layers';
            link.href = '#';
            L.DomEvent.on(link, 'click', function (e) { L.DomEvent.preventDefault(e); load(); });
        }

        function load() {
            fetchJSON(configUrl + '?t=' + Date.now()).then(update)
                .catch(function (err) { console.error('[DynamicLayers]', err); });
        }

        load();
        if (refreshMs > 0) setInterval(load, refreshMs);
        window.refreshDynamicLayers = load;
    }

    // --- Map ---------------------------------------------------------------

    function init(cfg) {
        if (cfg.title) document.title = cfg.title;

        var map = L.map('map', {center: cfg.map.center, zoom: cfg.map.zoom, zoomControl: true});
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
                maxZoom: b.maxZoom || 18, maxNativeZoom: b.maxZoom || 18
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
        (cfg.cruises || []).forEach(function (c) {
            var layer = stationLayer(c);
            if (c.visible !== false) layer.addTo(map);
            overlays[c.name] = layer;
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

        if (cfg.layer_config) dynamicLayers(map, cfg.layer_config, cfg.layer_refresh_ms || 0);
    }

    fetchJSON('site_config.json').then(init).catch(function (err) {
        console.error('[seaview] failed to load site_config.json', err);
        document.getElementById('map').textContent = 'Failed to load site_config.json: ' + err.message;
    });
})();
