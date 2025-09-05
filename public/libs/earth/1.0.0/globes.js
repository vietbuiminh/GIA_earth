/**
 * globes - a set of models of the earth, each having their own kind of projection and onscreen behavior.
 *
 * Copyright (c) 2014 Cameron Beccario
 * The MIT License - http://opensource.org/licenses/MIT
 *
 * https://github.com/cambecc/earth
 */
var globes = function() {
    "use strict";

    /**
     * @returns {Array} rotation of globe to current position of the user. Aside from asking for geolocation,
     *          which user may reject, there is not much available except timezone. Better than nothing.
     */
    function currentPosition() {
        var λ = µ.floorMod(new Date().getTimezoneOffset() / 4, 360);  // 24 hours * 60 min / 4 === 360 degrees
        return [λ, 0];
    }

    function ensureNumber(num, fallback) {
        return _.isFinite(num) || num === Infinity || num === -Infinity ? num : fallback;
    }

    /**
     * @param bounds the projection bounds: [[x0, y0], [x1, y1]]
     * @param view the view bounds {width:, height:}
     * @returns {Object} the projection bounds clamped to the specified view.
     */
    function clampedBounds(bounds, view) {
        var upperLeft = bounds[0];
        var lowerRight = bounds[1];
        var x = Math.max(Math.floor(ensureNumber(upperLeft[0], 0)), 0);
        var y = Math.max(Math.floor(ensureNumber(upperLeft[1], 0)), 0);
        var xMax = Math.min(Math.ceil(ensureNumber(lowerRight[0], view.width)), view.width - 1);
        var yMax = Math.min(Math.ceil(ensureNumber(lowerRight[1], view.height)), view.height - 1);
        return {x: x, y: y, xMax: xMax, yMax: yMax, width: xMax - x + 1, height: yMax - y + 1};
    }

    /**
     * Returns a globe object with standard behavior. At least the newProjection method must be overridden to
     * be functional.
     */
    function standardGlobe() {
        return {
            // Relief overlay state (per globe instance)
            reliefHi: { img: null, data: null, loaded: false },
            reliefLo: { img: null, data: null, loaded: false },
            useReliefLo: false,
            reliefFastScale: 0.25,
            reliefFastCanvas: null,
            reliefCanvas: null,
            reliefCache: {},
            // Initialize relief canvas and fast canvas
            initReliefCanvas: function(view) {
                if (!this.reliefCanvas) {
                    this.reliefCanvas = document.getElementById("relief-canvas");
                    if (!this.reliefCanvas) {
                        this.reliefCanvas = document.createElement("canvas");
                        this.reliefCanvas.id = "relief-canvas";
                        this.reliefCanvas.className = "fill-screen";
                        var display = document.getElementById("display");
                        if (display) {
                            display.insertBefore(this.reliefCanvas, display.children[1]);
                        } else {
                            document.body.appendChild(this.reliefCanvas);
                        }
                    }
                }
                this.reliefCanvas.width = view.width;
                this.reliefCanvas.height = view.height;
                if (!this.reliefFastCanvas) {
                    this.reliefFastCanvas = document.createElement("canvas");
                }
                this.reliefFastCanvas.width = Math.round(view.width * this.reliefFastScale);
                this.reliefFastCanvas.height = Math.round(view.height * this.reliefFastScale);
            },
            // Relief cache key
            getReliefCacheKey: function(projection, view) {
                var rot = projection.rotate ? projection.rotate() : [];
                var scl = projection.scale ? projection.scale() : 1;
                var tr = projection.translate ? projection.translate() : [];
                return rot.join(",") + ":" + scl + ":" + tr.join(",") + ":" + view.width + ":" + view.height;
            },
            // Relief image loader
            loadReliefImages: function(callback) {
                var self = this;
                var loadedCount = 0;
                function checkDone() {
                    loadedCount++;
                    if (loadedCount === 2 && callback) callback();
                }
                if (!self.reliefHi.loaded) {
                    self.reliefHi.img = new window.Image();
                    self.reliefHi.img.onload = function() {
                        var tmp = document.createElement("canvas");
                        tmp.width = self.reliefHi.img.width;
                        tmp.height = self.reliefHi.img.height;
                        var tmpCtx = tmp.getContext("2d");
                        tmpCtx.drawImage(self.reliefHi.img, 0, 0);
                        self.reliefHi.data = tmpCtx.getImageData(0, 0, self.reliefHi.img.width, self.reliefHi.img.height).data;
                        self.reliefHi.loaded = true;
                        checkDone();
                    };
                    self.reliefHi.img.src = "relief.jpg";
                    // self.reliefHi.img.src = "RSL_10kya.png";
                } else {
                    checkDone();
                }
                if (!self.reliefLo.loaded) {
                    self.reliefLo.img = new window.Image();
                    self.reliefLo.img.onload = function() {
                        var tmp = document.createElement("canvas");
                        tmp.width = self.reliefLo.img.width;
                        tmp.height = self.reliefLo.img.height;
                        var tmpCtx = tmp.getContext("2d");
                        tmpCtx.drawImage(self.reliefLo.img, 0, 0);
                        self.reliefLo.data = tmpCtx.getImageData(0, 0, self.reliefLo.img.width, self.reliefLo.img.height).data;
                        self.reliefLo.loaded = true;
                        checkDone();
                    };
                    self.reliefLo.img.src = "relief-low.jpg";
                } else {
                    checkDone();
                }
            },
            // Relief draw method
            drawRelief: function(view, projection) {
                var relief = this.useReliefLo ? this.reliefLo : this.reliefHi;
                if (!relief.loaded || !relief.data) return;
                var ctx = this.reliefCanvas.getContext("2d");
                ctx.clearRect(0, 0, view.width, view.height);
                var cacheKey = this.getReliefCacheKey(projection, view);
                if (!this.useReliefLo) {
                    var cached = this.reliefCache[cacheKey];
                    if (cached && cached.width === view.width && cached.height === view.height) {
                        ctx.putImageData(cached, 0, 0);
                        return;
                    }
                }
                if (this.useReliefLo) {
                    var fastW = this.reliefFastCanvas.width;
                    var fastH = this.reliefFastCanvas.height;
                    var fastCtx = this.reliefFastCanvas.getContext("2d");
                    var outImg = fastCtx.createImageData(fastW, fastH);
                    for (var y = 0; y < fastH; y++) {
                        for (var x = 0; x < fastW; x++) {
                            var sx = x / fastW * view.width;
                            var sy = y / fastH * view.height;
                            var lonlat = projection.invert([sx, sy]);
                            if (!lonlat) continue;
                            var lon = lonlat[0], lat = lonlat[1];
                            var ix = Math.round((lon + 180) / 360 * (relief.img.width - 1));
                            var iy = Math.round((90 - lat) / 180 * (relief.img.height - 1));
                            if (ix < 0 || ix >= relief.img.width || iy < 0 || iy >= relief.img.height) continue;
                            var idx = (iy * relief.img.width + ix) * 4;
                            var oidx = (y * fastW + x) * 4;
                            outImg.data[oidx] = relief.data[idx];
                            outImg.data[oidx+1] = relief.data[idx+1];
                            outImg.data[oidx+2] = relief.data[idx+2];
                            outImg.data[oidx+3] = Math.round(relief.data[idx+3] * 0.7);
                        }
                    }
                    fastCtx.putImageData(outImg, 0, 0);
                    ctx.imageSmoothingEnabled = false;
                    ctx.drawImage(this.reliefFastCanvas, 0, 0, view.width, view.height);
                } else {
                    var outImg = ctx.createImageData(view.width, view.height);
                    for (var y = 0; y < view.height; y++) {
                        for (var x = 0; x < view.width; x++) {
                            var lonlat = projection.invert([x, y]);
                            if (!lonlat) continue;
                            var lon = lonlat[0], lat = lonlat[1];
                            var ix = Math.round((lon + 180) / 360 * (relief.img.width - 1));
                            var iy = Math.round((90 - lat) / 180 * (relief.img.height - 1));
                            if (ix < 0 || ix >= relief.img.width || iy < 0 || iy >= relief.img.height) continue;
                            var idx = (iy * relief.img.width + ix) * 4;
                            var oidx = (y * view.width + x) * 4;
                            outImg.data[oidx] = relief.data[idx];
                            outImg.data[oidx+1] = relief.data[idx+1];
                            outImg.data[oidx+2] = relief.data[idx+2];
                            outImg.data[oidx+3] = Math.round(relief.data[idx+3] * 0.7);
                        }
                    }
                    ctx.putImageData(outImg, 0, 0);
                    this.reliefCache[cacheKey] = outImg;
                }
            },
            clearReliefCache: function() {
                this.reliefCache = {};
            },
            /**
             * This globe's current D3 projection.
             */
            projection: null,

            /**
             * @param view the size of the view as {width:, height:}.
             * @returns {Object} a new D3 projection of this globe appropriate for the specified view port.
             */
            newProjection: function(view) {
                throw new Error("method must be overridden");
            },

            /**
             * @param view the size of the view as {width:, height:}.
             * @returns {{x: Number, y: Number, xMax: Number, yMax: Number, width: Number, height: Number}}
             *          the bounds of the current projection clamped to the specified view.
             */
            bounds: function(view) {
                return clampedBounds(d3.geo.path().projection(this.projection).bounds({type: "Sphere"}), view);
            },

            /**
             * @param view the size of the view as {width:, height:}.
             * @returns {Number} the projection scale at which the entire globe fits within the specified view.
             */
            fit: function(view) {
                var defaultProjection = this.newProjection(view);
                var bounds = d3.geo.path().projection(defaultProjection).bounds({type: "Sphere"});
                var hScale = (bounds[1][0] - bounds[0][0]) / defaultProjection.scale();
                var vScale = (bounds[1][1] - bounds[0][1]) / defaultProjection.scale();
                return Math.min(view.width / hScale, view.height / vScale) * 0.9;
            },

            /**
             * @param view the size of the view as {width:, height:}.
             * @returns {Array} the projection transform at which the globe is centered within the specified view.
             */
            center: function(view) {
                return [view.width / 2, view.height / 2];
            },

            /**
             * @returns {Array} the range at which this globe can be zoomed.
             */
            scaleExtent: function() {
                return [100, 10000];
            },

            /**
             * Returns the current orientation of this globe as a string. If the arguments are specified,
             * mutates this globe to match the specified orientation string, usually in the form "lat,lon,scale".
             *
             * @param [o] the orientation string
             * @param [view] the size of the view as {width:, height:}.
             */
            orientation: function(o, view) {
                var projection = this.projection, rotate = projection.rotate();
                if (µ.isValue(o)) {
                    var parts = o.split(","), λ = +parts[0], φ = +parts[1], scale = +parts[2];
                    var extent = this.scaleExtent();
                    projection.rotate(_.isFinite(λ) && _.isFinite(φ) ?
                        [-λ, -φ, rotate[2]] :
                        this.newProjection(view).rotate());
                    projection.scale(_.isFinite(scale) ? µ.clamp(scale, extent[0], extent[1]) : this.fit(view));
                    projection.translate(this.center(view));
                    return this;
                }
                return [(-rotate[0]).toFixed(2), (-rotate[1]).toFixed(2), Math.round(projection.scale())].join(",");
            },

            /**
             * Returns an object that mutates this globe's current projection during a drag/zoom operation.
             * Each drag/zoom event invokes the move() method, and when the move is complete, the end() method
             * is invoked.
             *
             * @param startMouse starting mouse position.
             * @param startScale starting scale.
             */
            manipulator: function(startMouse, startScale) {
                var projection = this.projection;
                var sensitivity = 60 / startScale;  // seems to provide a good drag scaling factor
                var rotation = [projection.rotate()[0] / sensitivity, -projection.rotate()[1] / sensitivity];
                var original = projection.precision();
                projection.precision(original * 10);
                return {
                    move: function(mouse, scale) {
                        if (mouse) {
                            var xd = mouse[0] - startMouse[0] + rotation[0];
                            var yd = mouse[1] - startMouse[1] + rotation[1];
                            projection.rotate([xd * sensitivity, -yd * sensitivity, projection.rotate()[2]]);
                        }
                        projection.scale(scale);
                    },
                    end: function() {
                        projection.precision(original);
                    }
                };
            },

            /**
             * @returns {Array} the transform to apply, if any, to orient this globe to the specified coordinates.
             */
            locate: function(coord) {
                return null;
            },

            /**
             * Draws a polygon on the specified context of this globe's boundary.
             * @param context a Canvas element's 2d context.
             * @returns the context
             */
            defineMask: function(context) {
                d3.geo.path().projection(this.projection).context(context)({type: "Sphere"});
                return context;
            },

            /**
             * Appends the SVG elements that render this globe.
             * @param mapSvg the primary map SVG container.
             * @param foregroundSvg the foreground SVG container.
             */
            defineMap: function(mapSvg, foregroundSvg, view) {
                var path = d3.geo.path().projection(this.projection);
                var defs = mapSvg.append("defs");
                defs.append("path")
                    .attr("id", "sphere")
                    .datum({type: "Sphere"})
                    .attr("d", path);
                mapSvg.append("use")
                    .attr("xlink:href", "#sphere")
                    .attr("class", "background-sphere");
                mapSvg.append("path")
                    .attr("class", "graticule")
                    .datum(d3.geo.graticule())
                    .attr("d", path);
                mapSvg.append("path")
                    .attr("class", "hemisphere")
                    .datum(d3.geo.graticule().minorStep([0, 90]).majorStep([0, 90]))
                    .attr("d", path);
                mapSvg.append("path")
                    .attr("class", "coastline");
                mapSvg.append("path")
                    .attr("class", "lakes");
                foregroundSvg.append("use")
                    .attr("xlink:href", "#sphere")
                    .attr("class", "foreground-sphere");
                // Initialize relief canvas for this globe
                if (view) this.initReliefCanvas(view);
            }
        };
    }

    function newGlobe(source, view) {
        var result = _.extend(standardGlobe(), source);
        result.projection = result.newProjection(view);
        return result;
    }

    // ============================================================================================

    function atlantis() {
        return newGlobe({
            newProjection: function() {
                return d3.geo.mollweide().rotate([30, -45, 90]).precision(0.1);
            }
        });
    }

    function azimuthalEquidistant() {
        return newGlobe({
            newProjection: function() {
                return d3.geo.azimuthalEquidistant().precision(0.1).rotate([0, -90]).clipAngle(180 - 0.001);
            }
        });
    }

    function conicEquidistant() {
        return newGlobe({
            newProjection: function() {
                return d3.geo.conicEquidistant().rotate(currentPosition()).precision(0.1);
            },
            center: function(view) {
                return [view.width / 2, view.height / 2 + view.height * 0.065];
            }
        });
    }

    function equirectangular() {
        return newGlobe({
            newProjection: function() {
                return d3.geo.equirectangular().rotate(currentPosition()).precision(0.1);
            }
        });
    }

    function orthographic() {
        return newGlobe({
            newProjection: function() {
                return d3.geo.orthographic().rotate(currentPosition()).precision(0.1).clipAngle(90);
            },
            defineMap: function(mapSvg, foregroundSvg) {
                var path = d3.geo.path().projection(this.projection);
                var defs = mapSvg.append("defs");
                var gradientFill = defs.append("radialGradient")
                    .attr("id", "orthographic-fill")
                    .attr("gradientUnits", "objectBoundingBox")
                    .attr("cx", "50%").attr("cy", "49%").attr("r", "50%");
                gradientFill.append("stop").attr("stop-color", "#303030").attr("offset", "69%");
                gradientFill.append("stop").attr("stop-color", "#202020").attr("offset", "91%");
                gradientFill.append("stop").attr("stop-color", "#000005").attr("offset", "96%");
                defs.append("path")
                    .attr("id", "sphere")
                    .datum({type: "Sphere"})
                    .attr("d", path);
                mapSvg.append("use")
                    .attr("xlink:href", "#sphere")
                    .attr("fill", "url(#orthographic-fill)");
                mapSvg.append("path")
                    .attr("class", "graticule")
                    .datum(d3.geo.graticule())
                    .attr("d", path);
                mapSvg.append("path")
                    .attr("class", "hemisphere")
                    .datum(d3.geo.graticule().minorStep([0, 90]).majorStep([0, 90]))
                    .attr("d", path);
                mapSvg.append("path")
                    .attr("class", "coastline");
                mapSvg.append("path")
                    .attr("class", "lakes");
                foregroundSvg.append("use")
                    .attr("xlink:href", "#sphere")
                    .attr("class", "foreground-sphere");
            },
            locate: function(coord) {
                return [-coord[0], -coord[1], this.projection.rotate()[2]];
            }
        });
    }

    function stereographic(view) {
        return newGlobe({
            newProjection: function(view) {
                return d3.geo.stereographic()
                    .rotate([-43, -20])
                    .precision(1.0)
                    .clipAngle(180 - 0.0001)
                    .clipExtent([[0, 0], [view.width, view.height]]);
            }
        }, view);
    }

    function waterman() {
        return newGlobe({
            newProjection: function() {
                return d3.geo.polyhedron.waterman().rotate([20, 0]).precision(0.1);
            },
            defineMap: function(mapSvg, foregroundSvg) {
                var path = d3.geo.path().projection(this.projection);
                var defs = mapSvg.append("defs");
                defs.append("path")
                    .attr("id", "sphere")
                    .datum({type: "Sphere"})
                    .attr("d", path);
                defs.append("clipPath")
                    .attr("id", "clip")
                    .append("use")
                    .attr("xlink:href", "#sphere");
                mapSvg.append("use")
                    .attr("xlink:href", "#sphere")
                    .attr("class", "background-sphere");
                mapSvg.append("path")
                    .attr("class", "graticule")
                    .attr("clip-path", "url(#clip)")
                    .datum(d3.geo.graticule())
                    .attr("d", path);
                mapSvg.append("path")
                    .attr("class", "coastline")
                    .attr("clip-path", "url(#clip)");
                mapSvg.append("path")
                    .attr("class", "lakes")
                    .attr("clip-path", "url(#clip)");
                foregroundSvg.append("use")
                    .attr("xlink:href", "#sphere")
                    .attr("class", "foreground-sphere");
            }
        });
    }

    function winkel3() {
        return newGlobe({
            newProjection: function() {
                return d3.geo.winkel3().precision(0.1);
            }
        });
    }

    return d3.map({
        atlantis: atlantis,
        azimuthal_equidistant: azimuthalEquidistant,
        conic_equidistant: conicEquidistant,
        equirectangular: equirectangular,
        orthographic: orthographic,
        stereographic: stereographic,
        waterman: waterman,
        winkel3: winkel3
    });

}();
