// Leaflet.Graticule with zoom-dependent intervals (extracted from cruise.bror.co)
(function () {
    if (typeof L.Graticule === 'undefined') {
        // Leaflet.Graticule plugin code
        L.Graticule = L.GeoJSON.extend({
            options: {
                interval: 20,
                showLabel: true,
                opacity: 1,
                weight: 0.8,
                color: '#111',
                font: '12px Verdana',
                fontColor: '#111',
                dashArray: null,
                zoneLabel: false
            },

            initialize: function(options) {
                L.Util.setOptions(this, options);
                this._layers = {};

                // Handle zoom intervals - store original config
                if (Array.isArray(this.options.interval)) {
                    this._zoomIntervals = this.options.interval.sort(function(a, b) {
                        return a.start - b.start;
                    });
                    // Don't create graticule yet - wait for onAdd to get map zoom
                    this._needsInit = true;
                } else {
                    // Fixed interval - create graticule now
                    if (this.options.sphere) {
                        this.addData(this._getSphericalGraticule());
                    } else {
                        this.addData(this._getGraticule());
                    }
                }
            },

            _getCurrentInterval: function(zoom) {
                if (!this._zoomIntervals) {
                    return this.options.interval;
                }

                var interval = this._zoomIntervals[0].interval;
                for (var i = 0; i < this._zoomIntervals.length; i++) {
                    if (zoom >= this._zoomIntervals[i].start) {
                        interval = this._zoomIntervals[i].interval;
                    } else {
                        break;
                    }
                }
                return interval;
            },

            _redrawGraticule: function() {
                if (!this._map) return;

                var currentZoom = this._map.getZoom();
                var newInterval = this._getCurrentInterval(currentZoom);

                if (newInterval !== this.options.interval) {
                    this.options.interval = newInterval;
                    this.clearLayers();

                    if (this.options.sphere) {
                        this.addData(this._getSphericalGraticule());
                    } else {
                        this.addData(this._getGraticule());
                    }

                    if (this._labels) {
                        this._updateLabels();
                    }
                }
            },

            _getGraticule: function() {
                var interval = this.options.interval;
                var features = [];

                // Latitude lines
                for (var lat = -90; lat <= 90; lat += interval) {
                    features.push({
                        type: 'Feature',
                        geometry: {
                            type: 'LineString',
                            coordinates: [[-180, lat], [180, lat]]
                        },
                        properties: {
                            value: lat,
                            direction: 'lat'
                        }
                    });
                }

                // Longitude lines
                for (var lon = -180; lon < 180; lon += interval) {
                    features.push({
                        type: 'Feature',
                        geometry: {
                            type: 'LineString',
                            coordinates: [[lon, -90], [lon, 90]]
                        },
                        properties: {
                            value: lon,
                            direction: 'lon'
                        }
                    });
                }

                return {
                    type: 'FeatureCollection',
                    features: features
                };
            },

            _getSphericalGraticule: function() {
                var interval = this.options.interval;
                var features = [];

                for (var lat = -90; lat <= 90; lat += interval) {
                    var coords = [];
                    for (var lon = -180; lon <= 180; lon += 5) {
                        coords.push([lon, lat]);
                    }
                    features.push({
                        type: 'Feature',
                        geometry: {
                            type: 'LineString',
                            coordinates: coords
                        },
                        properties: {
                            value: lat,
                            direction: 'lat'
                        }
                    });
                }

                for (var lon = -180; lon < 180; lon += interval) {
                    var coords = [];
                    for (var lat = -90; lat <= 90; lat += 5) {
                        coords.push([lon, lat]);
                    }
                    features.push({
                        type: 'Feature',
                        geometry: {
                            type: 'LineString',
                            coordinates: coords
                        },
                        properties: {
                            value: lon,
                            direction: 'lon'
                        }
                    });
                }

                return {
                    type: 'FeatureCollection',
                    features: features
                };
            },

            onAdd: function(map) {
                // Call parent onAdd first to set up the layer
                L.GeoJSON.prototype.onAdd.call(this, map);

                // If using zoom intervals, initialize graticule now that we have map
                if (this._needsInit) {
                    var currentZoom = map.getZoom();
                    this.options.interval = this._getCurrentInterval(currentZoom);

                    if (this.options.sphere) {
                        this.addData(this._getSphericalGraticule());
                    } else {
                        this.addData(this._getGraticule());
                    }

                    this._needsInit = false;
                }

                if (this.options.showLabel) {
                    this._labels = L.layerGroup();
                    this._labels.addTo(map);
                    this._updateLabels();
                    map.on('move', this._updateLabels, this);
                }

                // Listen for zoom events to update interval
                if (this._zoomIntervals) {
                    map.on('zoomend', this._redrawGraticule, this);
                }
            },

            onRemove: function(map) {
                L.GeoJSON.prototype.onRemove.call(this, map);
                if (this._labels) {
                    map.removeLayer(this._labels);
                    map.off('move', this._updateLabels, this);
                }

                // Remove zoom event listener
                if (this._zoomIntervals) {
                    map.off('zoomend', this._redrawGraticule, this);
                }
            },

            _updateLabels: function() {
                if (!this._labels) return;

                var map = this._map;
                var bounds = map.getBounds();

                this._labels.clearLayers();

                var self = this;
                this.eachLayer(function(layer) {
                    var props = layer.feature.properties;
                    var coords = layer.feature.geometry.coordinates;

                    if (props.direction === 'lat') {
                        var point = L.latLng(props.value, bounds.getCenter().lng);
                        if (bounds.contains(point)) {
                            self._addLabel(point, self._formatLabel(props.value, 'lat'));
                        }
                    } else {
                        var point = L.latLng(bounds.getCenter().lat, props.value);
                        if (bounds.contains(point)) {
                            self._addLabel(point, self._formatLabel(props.value, 'lon'));
                        }
                    }
                });
            },

            _formatLabel: function(value, direction) {
                if (this.options.zoneLabel) {
                    if (direction === 'lat') {
                        return Math.abs(value) + '°' + (value >= 0 ? 'N' : 'S');
                    } else {
                        return Math.abs(value) + '°' + (value >= 0 ? 'E' : 'W');
                    }
                }
                return value + '°';
            },

            _addLabel: function(latLng, text) {
                var icon = L.divIcon({
                    className: 'leaflet-graticule-label',
                    html: '<span style="color: ' + this.options.fontColor +
                          '; font: ' + this.options.font +
                          '; white-space: nowrap;">' + text + '</span>',
                    iconSize: [0, 0]
                });
                L.marker(latLng, {icon: icon, interactive: false}).addTo(this._labels);
            },

            style: function(feature) {
                return {
                    color: this.options.color,
                    opacity: this.options.opacity,
                    weight: this.options.weight,
                    dashArray: this.options.dashArray,
                    interactive: false
                };
            }
        });

        L.graticule = function(options) {
            return new L.Graticule(options);
        };
    }
})();
