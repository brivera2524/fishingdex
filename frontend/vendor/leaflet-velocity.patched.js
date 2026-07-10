"use strict";

/*
 Generic  Canvas Layer for leaflet 0.7 and 1.0-rc,
 copyright Stanislav Sumbera,  2016 , sumbera.com , license MIT
 originally created and motivated by L.CanvasOverlay  available here: https://gist.github.com/Sumbera/11114288

 */
// -- L.DomUtil.setTransform from leaflet 1.0.0 to work on 0.0.7
//------------------------------------------------------------------------------
if (!L.DomUtil.setTransform) {
  L.DomUtil.setTransform = function (el, offset, scale) {
    var pos = offset || new L.Point(0, 0);
    el.style[L.DomUtil.TRANSFORM] = (L.Browser.ie3d ? "translate(" + pos.x + "px," + pos.y + "px)" : "translate3d(" + pos.x + "px," + pos.y + "px,0)") + (scale ? " scale(" + scale + ")" : "");
  };
} // -- support for both  0.0.7 and 1.0.0 rc2 leaflet


// Rewritten from the original screen-pixel-indexed CanvasLayer (which
// repositioned/resized itself relative to the current viewport on every
// "moveend", requiring this content to be fully rebuilt on every single
// pan) into a geographically-anchored layer modeled directly on Leaflet's
// own ImageOverlay: the canvas represents a *fixed* LatLngBounds at a fixed
// internal pixel resolution, and Leaflet's proven getEvents()/_reset()/
// _animateZoom() pattern (the exact same one every tile and image overlay
// uses) positions and scales it automatically during pan and zoom. A plain
// pan within this canvas's bounds needs zero code from us at all -- the
// map's own pane transform carries it along, the same as it does for
// tiles. VelocityLayer only needs to rebuild the canvas (at a new,
// re-centered LatLngBounds) when the view pans far enough to exceed it, or
// on any zoom (since the pixel resolution needs to change to match).
L.CanvasLayer = (L.Layer ? L.Layer : L.Class).extend({
  initialize: function initialize(options) {
    this._map = null;
    this._canvas = null;
    this._bounds = null;
    this._delegate = null;
    L.setOptions(this, options);
  },
  delegate: function delegate(del) {
    this._delegate = del;
    return this;
  },
  getBounds: function getBounds() {
    return this._bounds;
  },
  // Updates which geographic extent this canvas represents (recentering
  // on a new area, e.g. after panning outside the previously-built
  // region). Deliberately does NOT touch the canvas's internal pixel
  // buffer -- see setPixelSize for why that has to stay a separate call.
  setBounds: function setBounds(bounds) {
    this._bounds = bounds;

    this._reset();
    return this;
  },
  // Resizes the canvas's *internal* pixel buffer -- unlike setBounds
  // above, this unavoidably clears whatever was drawn (that's just how
  // canvas width/height assignment works in every browser, even when set
  // to the same value it already was). Only called when the buffer's
  // pixel dimensions actually need to change (built once at layer setup,
  // and again only on an actual container resize) -- ordinary pan/zoom-
  // triggered rebuilds keep the existing buffer size and just draw fresh
  // content into it via setBounds, so the "keep the old animation playing
  // while rebuilding" continuity (see start() in the Windy factory) isn't
  // undermined by an incidental clear here.
  setPixelSize: function setPixelSize(pixelWidth, pixelHeight) {
    if (this._canvas) {
      this._canvas.width = pixelWidth;
      this._canvas.height = pixelHeight;
    }

    return this;
  },
  setOpacity: function setOpacity(opacity) {
    if (this._canvas) this._canvas.style.opacity = opacity;
  },
  //-------------------------------------------------------------
  getEvents: function getEvents() {
    // Deliberately no "zoom"/"viewreset"/"moveend"/"resize" repositioning
    // here at all -- unlike ImageOverlay (which this class's _reset/
    // _animateZoom pattern is modeled on), this canvas's content isn't a
    // static image that's always valid for its bounds; it has to be
    // rebuilt for a new region on zoom, and VelocityLayer's own rebuild
    // logic is what decides when a pan has exceeded the buffered region.
    // Repositioning is gated on that rebuild actually finishing (see
    // VelocityLayer._rebuild's onReady callback into windy.start, which
    // calls setBounds() -- and setBounds() is what calls _reset()).
    //
    // Binding "viewreset" here directly (as ImageOverlay does) is actively
    // wrong for this layer: Map.panBy has a "pan too far" workaround for a
    // Chrome tile-rendering bug (#2602) that skips the normal smooth-pan
    // animation and calls _resetView() directly instead for any pan
    // larger than the map's own container size -- and _resetView() fires
    // both "moveend" *and* "viewreset". That "viewreset" would reposition
    // this canvas immediately, ungated, using this._bounds before
    // VelocityLayer's rebuild (already triggered by the "moveend" that
    // fired moments earlier) has had any chance to finish -- exactly the
    // "repositioned before its content is ready" bug this whole onReady
    // mechanism exists to prevent, and why it was only ever visible on
    // large pans specifically.
    var events = {};

    if (this._map.options.zoomAnimation && L.Browser.any3d) {
      events.zoomanim = this._animateZoom;
    }

    return events;
  },
  //-------------------------------------------------------------
  onAdd: function onAdd(map) {
    this._map = map;
    this._canvas = L.DomUtil.create("canvas", "leaflet-layer");
    var animated = this._map.options.zoomAnimation && L.Browser.any3d;
    L.DomUtil.addClass(this._canvas, "leaflet-zoom-" + (animated ? "animated" : "hide"));
    // No CSS transition on this element's transform: a `transition: transform`
    // was tried briefly to soften _reset()'s reposition, but the swap to a
    // new generation now hard-clears the canvas first (see Windy's start()),
    // so by the time _reset() moves it there's nothing but blank pixels on
    // it -- animating that move just reads as the (still-empty) canvas
    // visibly sliding in from the wrong spot before repopulating. Snapping
    // straight to the correct position is the better tradeoff now that the
    // clear makes the snap itself invisible.
    this.options.pane.appendChild(this._canvas);
    map.on(this.getEvents(), this);
    var del = this._delegate || this;
    del.onLayerDidMount && del.onLayerDidMount(); // -- callback

    if (this._bounds) this._reset();
  },
  //-------------------------------------------------------------
  onRemove: function onRemove(map) {
    var del = this._delegate || this;
    del.onLayerWillUnmount && del.onLayerWillUnmount(); // -- callback

    this.options.pane.removeChild(this._canvas);
    map.off(this.getEvents(), this);
    this._canvas = null;
  },
  //------------------------------------------------------------
  addTo: function addTo(map) {
    map.addLayer(this);
    return this;
  },
  //------------------------------------------------------------------------------
  // Positions and sizes the canvas element from its fixed LatLngBounds --
  // identical in spirit to L.ImageOverlay._reset(). Since this._bounds
  // never changes for a plain pan (only VelocityLayer choosing to rebuild
  // it, on zoom or panning outside it, changes it), the *only* caller is
  // setBounds() -- getEvents() deliberately binds nothing to "zoom" or
  // "viewreset" directly (see the comment there for why that was actively
  // wrong for this layer), so nothing should invoke this except a rebuild
  // that's already finished and ready to display.
  _reset: function _reset() {
    if (!this._bounds) return;
    var topLeft = this._map.latLngToLayerPoint(this._bounds.getNorthWest());
    var bottomRight = this._map.latLngToLayerPoint(this._bounds.getSouthEast());
    L.DomUtil.setPosition(this._canvas, topLeft);
    this._canvas.style.width = bottomRight.x - topLeft.x + "px";
    this._canvas.style.height = bottomRight.y - topLeft.y + "px";
  },
  //------------------------------------------------------------------------------
  // Same technique L.ImageOverlay uses for a smooth zoom transition:
  // CSS-transform the element to its *target* zoom-level position/scale for
  // the duration of the animated zoom, rather than leaving it at its
  // pre-zoom position/size until _reset() catches up at zoomend. The
  // canvas's own pixel content stays exactly what it was (at the old
  // zoom's resolution) through this, so it reads as slightly soft/blurry
  // during the transition -- the same tradeoff tiles make at every zoom
  // level change, familiar and expected rather than a bug.
  _animateZoom: function _animateZoom(e) {
    if (!this._bounds) return;

    try {
      var scale = this._map.getZoomScale(e.zoom);
      var offset = this._map._latLngBoundsToNewLayerBounds(this._bounds, e.zoom, e.center).min;
      L.DomUtil.setTransform(this._canvas, offset, scale);
    } catch (err) {
      console.error("[leaflet-velocity] _animateZoom (zoomanim) threw:", err);
    }
  }
});

L.canvasLayer = function (options) {
  return new L.CanvasLayer(options);
};

L.Control.Velocity = L.Control.extend({
  options: {
    position: "bottomleft",
    emptyString: "Unavailable",
    // Could be any combination of 'bearing' (angle toward which the flow goes) or 'meteo' (angle from which the flow comes)
    // and 'CW' (angle value increases clock-wise) or 'CCW' (angle value increases counter clock-wise)
    angleConvention: "bearingCCW",
    showCardinal: false,
    // Could be 'm/s' for meter per second, 'k/h' for kilometer per hour, 'mph' for miles per hour or 'kt' for knots
    speedUnit: "m/s",
    directionString: "Direction",
    speedString: "Speed",
    onAdd: null,
    onRemove: null
  },
  onAdd: function onAdd(map) {
    this._container = L.DomUtil.create("div", "leaflet-control-velocity");
    L.DomEvent.disableClickPropagation(this._container);
    map.on("mousemove", this._onMouseMove, this);
    this._container.innerHTML = this.options.emptyString;
    if (this.options.leafletVelocity.options.onAdd) this.options.leafletVelocity.options.onAdd();
    return this._container;
  },
  onRemove: function onRemove(map) {
    map.off("mousemove", this._onMouseMove, this);
    if (this.options.leafletVelocity.options.onRemove) this.options.leafletVelocity.options.onRemove();
  },
  vectorToSpeed: function vectorToSpeed(uMs, vMs, unit) {
    var velocityAbs = Math.sqrt(Math.pow(uMs, 2) + Math.pow(vMs, 2)); // Default is m/s

    if (unit === "k/h") {
      return this.meterSec2kilometerHour(velocityAbs);
    } else if (unit === "kt") {
      return this.meterSec2Knots(velocityAbs);
    } else if (unit === "mph") {
      return this.meterSec2milesHour(velocityAbs);
    } else {
      return velocityAbs;
    }
  },
  vectorToDegrees: function vectorToDegrees(uMs, vMs, angleConvention) {
    // Default angle convention is CW
    if (angleConvention.endsWith("CCW")) {
      // vMs comes out upside-down..
      vMs = vMs > 0 ? vMs = -vMs : Math.abs(vMs);
    }

    var velocityAbs = Math.sqrt(Math.pow(uMs, 2) + Math.pow(vMs, 2));
    var velocityDir = Math.atan2(uMs / velocityAbs, vMs / velocityAbs);
    var velocityDirToDegrees = velocityDir * 180 / Math.PI + 180;

    if (angleConvention === "bearingCW" || angleConvention === "meteoCCW") {
      velocityDirToDegrees += 180;
      if (velocityDirToDegrees >= 360) velocityDirToDegrees -= 360;
    }

    return velocityDirToDegrees;
  },
  degreesToCardinalDirection: function degreesToCardinalDirection(deg) {
    var cardinalDirection = '';

    if (deg >= 0 && deg < 11.25 || deg >= 348.75) {
      cardinalDirection = 'N';
    } else if (deg >= 11.25 && deg < 33.75) {
      cardinalDirection = 'NNW';
    } else if (deg >= 33.75 && deg < 56.25) {
      cardinalDirection = 'NW';
    } else if (deg >= 56.25 && deg < 78.75) {
      cardinalDirection = 'WNW';
    } else if (deg >= 78.25 && deg < 101.25) {
      cardinalDirection = 'W';
    } else if (deg >= 101.25 && deg < 123.75) {
      cardinalDirection = 'WSW';
    } else if (deg >= 123.75 && deg < 146.25) {
      cardinalDirection = 'SW';
    } else if (deg >= 146.25 && deg < 168.75) {
      cardinalDirection = 'SSW';
    } else if (deg >= 168.75 && deg < 191.25) {
      cardinalDirection = 'S';
    } else if (deg >= 191.25 && deg < 213.75) {
      cardinalDirection = 'SSE';
    } else if (deg >= 213.75 && deg < 236.25) {
      cardinalDirection = 'SE';
    } else if (deg >= 236.25 && deg < 258.75) {
      cardinalDirection = 'ESE';
    } else if (deg >= 258.75 && deg < 281.25) {
      cardinalDirection = 'E';
    } else if (deg >= 281.25 && deg < 303.75) {
      cardinalDirection = 'ENE';
    } else if (deg >= 303.75 && deg < 326.25) {
      cardinalDirection = 'NE';
    } else if (deg >= 326.25 && deg < 348.75) {
      cardinalDirection = 'NNE';
    }

    return cardinalDirection;
  },
  meterSec2Knots: function meterSec2Knots(meters) {
    return meters / 0.514;
  },
  meterSec2kilometerHour: function meterSec2kilometerHour(meters) {
    return meters * 3.6;
  },
  meterSec2milesHour: function meterSec2milesHour(meters) {
    return meters * 2.23694;
  },
  _onMouseMove: function _onMouseMove(e) {
    var self = this;

    var pos = this.options.leafletVelocity._map.containerPointToLatLng(L.point(e.containerPoint.x, e.containerPoint.y));

    var gridValue = this.options.leafletVelocity._windy.interpolatePoint(pos.lng, pos.lat);

    var htmlOut = "";

    if (gridValue && !isNaN(gridValue[0]) && !isNaN(gridValue[1]) && gridValue[2]) {
      var deg = self.vectorToDegrees(gridValue[0], gridValue[1], this.options.angleConvention);
      var cardinal = this.options.showCardinal ? " (".concat(self.degreesToCardinalDirection(deg), ") ") : '';
      htmlOut = "<strong> ".concat(this.options.velocityType, " ").concat(this.options.directionString, ": </strong> ").concat(deg.toFixed(2), "\xB0").concat(cardinal, ", <strong> ").concat(this.options.velocityType, " ").concat(this.options.speedString, ": </strong> ").concat(self.vectorToSpeed(gridValue[0], gridValue[1], this.options.speedUnit).toFixed(2), " ").concat(this.options.speedUnit);
    } else {
      htmlOut = this.options.emptyString;
    }

    self._container.innerHTML = htmlOut;
  }
});
L.Map.mergeOptions({
  positionControl: false
});
L.Map.addInitHook(function () {
  if (this.options.positionControl) {
    this.positionControl = new L.Control.MousePosition();
    this.addControl(this.positionControl);
  }
});

L.control.velocity = function (options) {
  return new L.Control.Velocity(options);
};

L.VelocityLayer = (L.Layer ? L.Layer : L.Class).extend({
  options: {
    displayValues: true,
    displayOptions: {
      velocityType: "Velocity",
      position: "bottomleft",
      emptyString: "No velocity data"
    },
    maxVelocity: 10,
    // used to align color scale
    colorScale: null,
    data: null
  },
  _map: null,
  _canvasLayer: null,
  _windy: null,
  _context: null,
  _mouseControl: null,
  // Pixel dimensions the canvas's internal buffer was last built at --
  // undefined until the first _rebuild() call. Compared against the
  // freshly-computed target size on every _rebuild() so an ordinary pan
  // (same viewport size, just a different center) skips the resize (and
  // the clear it would otherwise cause) entirely.
  _builtPixelWidth: undefined,
  _builtPixelHeight: undefined,
  // How generously to buffer the built region beyond the current viewport,
  // as a fraction of the viewport's own width/height added to *each* side
  // (0.25 means the buffered region ends up 1.5x the viewport's own
  // width/height, i.e. ~2.25x its area -- see LatLngBounds.pad, used
  // below, which grows by exactly this factor). Panning within this
  // buffered area needs no rebuild, canvas reposition, or any other code
  // at all: this canvas is anchored to a fixed geographic area (see
  // project()/invert() in the Windy factory below), and Leaflet's own
  // pane transform already carries any pane child through a pan
  // correctly, the same way it does for tiles. Only exceeding this
  // buffer, or any zoom (which changes the pixel resolution needed for
  // the same on-screen density), triggers an actual rebuild.
  //
  // Deliberately kept modest rather than very generous: interpolateField's
  // cost scales with this region's area, and the only way to keep a much
  // larger buffer cheap is a coarser FIELD_PIXEL_STEP -- which directly
  // widens the land-mask "bleed" radius at every coastline (a coarser
  // step fills a bigger block around each sample with that one sample's
  // land/water value). A previous attempt used a much larger buffer
  // (0.75) with a coarser step (8px) to compensate, which reintroduced
  // exactly that bug -- real current visibly bleeding onto land. Rebuilds
  // being somewhat more frequent with a smaller buffer is an acceptable
  // trade against that; they're fast (see FIELD_PIXEL_STEP) and don't
  // interrupt the animation (see the generation-swap continuity in
  // start(), below).
  BUFFER_RATIO: 0.25,
  initialize: function initialize(options) {
    L.setOptions(this, options);
  },
  onAdd: function onAdd(map) {
    // determine where to add the layer
    this._paneName = this.options.paneName || "overlayPane"; // fall back to overlayPane for leaflet < 1

    var pane = map._panes.overlayPane;

    if (map.getPane) {
      // attempt to get pane first to preserve parent (createPane voids this)
      pane = map.getPane(this._paneName);

      if (!pane) {
        pane = map.createPane(this._paneName);
      }
    } // create canvas, add to map pane


    this._canvasLayer = L.canvasLayer({
      pane: pane
    }).delegate(this);

    this._canvasLayer.addTo(map);

    this._map = map;

    this._initWindy();

    var self = this;

    this._map.on("moveend", function () {
      self._onMapMoveEnd();
    });

    this._map.on("zoomend resize", function () {
      // Both genuinely invalidate the built region's resolution -- a zoom
      // changes the pixel density needed for the same on-screen detail, a
      // container resize changes how big the buffered canvas needs to be
      // in the first place -- so always rebuild (and resize the pixel
      // buffer) here, rather than only rebuilding if the buffer's
      // geographic bounds were exceeded, which is the (much more common)
      // plain-pan check _onMapMoveEnd does instead.
      //
      // Deliberately not also listening for "viewreset" here, even though
      // it can fire for reasons other than zoom (e.g. Map.panBy's "pan too
      // far" workaround for a Chrome tile bug, which calls _resetView()
      // directly for any pan larger than the map's own container size).
      // _resetView() always fires "moveend" too, in every case including
      // that one, so _onMapMoveEnd already reacts to it correctly as an
      // ordinary (if large) pan -- forcing a resize/clear here as well
      // would just be a wasted, wrong-diagnosis rebuild for what is
      // really only a pan, discarding the "keep the old animation playing
      // while rebuilding" continuity for no reason.
      self._rebuild(true);
    });

    this._initMouseHandler(false);
  },
  onRemove: function onRemove(map) {
    this._destroyWind();
  },
  setData: function setData(data) {
    this.options.data = data;

    if (this._windy) {
      this._windy.setData(data);

      // A real data reload always needs a hard clear -- the old trails
      // represent stale data, not just a stale (but still geographically
      // valid) view, so the no-clear treatment ordinary rebuilds get in
      // start() (Windy factory) doesn't apply here.
      this._hardClear();

      this._rebuild(false);
    }

    this.fire("load");
  },
  setOpacity: function setOpacity(opacity) {
    this._canvasLayer.setOpacity(opacity);
  },
  setOptions: function setOptions(options) {
    this.options = Object.assign(this.options, options);

    if (options.hasOwnProperty("displayOptions")) {
      this.options.displayOptions = Object.assign(this.options.displayOptions, options.displayOptions);

      this._initMouseHandler(true);
    }

    if (options.hasOwnProperty("data")) this.options.data = options.data;

    if (this._windy) {
      this._windy.setOptions(options);

      if (options.hasOwnProperty("data")) this._windy.setData(options.data);

      this._hardClear(); // see setData above


      this._rebuild(false);
    }

    this.fire("load");
  },

  /*------------------------------------ PRIVATE ------------------------------------------*/
  _initWindy: function _initWindy() {
    var options = Object.assign({
      canvas: this._canvasLayer._canvas,
      map: this._map
    }, this.options);
    this._windy = new Windy(options);
    this._context = this._canvasLayer._canvas.getContext("2d");

    this._canvasLayer._canvas.classList.add("velocity-overlay");

    if (this.options.data) this._rebuild(true);
  },
  // Checked on every plain "moveend" -- the common case, and the one this
  // whole rewrite is about making cheap. If the view hasn't panned outside
  // the region this canvas was last built for, there is *nothing to do*:
  // no reposition, no rebuild, no compensation -- Leaflet's own pane
  // transform has already carried this canvas to the geographically
  // correct place, same as it does for every tile.
  _onMapMoveEnd: function _onMapMoveEnd() {
    if (!this._windy || !this.options.data) return;
    var builtBounds = this._canvasLayer.getBounds();
    if (builtBounds && builtBounds.contains(this._map.getBounds())) return;
    this._rebuild(false);
  },
  // resizePixelBuffer: true for the very first build, and for a genuine
  // zoom/container-resize (where the pixel resolution actually needs to
  // change); false for an ordinary pan-exceeded-the-buffer rebuild, which
  // reuses the existing pixel buffer size and therefore doesn't clear the
  // canvas -- letting the "keep the old animation playing while rebuilding"
  // continuity in the Windy factory's start() work as intended.
  _rebuild: function _rebuild(resizePixelBuffer) {
    if (!this._windy || !this.options.data) return;
    var self = this;
    var viewBounds = this._map.getBounds();
    var bufferedBounds = viewBounds.pad(this.BUFFER_RATIO);
    var zoom = this._map.getZoom();
    var viewSize = this._map.getSize();
    var scale = 1 + this.BUFFER_RATIO * 2; // matches LatLngBounds.pad's own growth factor

    var pixelWidth = Math.round(viewSize.x * scale);
    var pixelHeight = Math.round(viewSize.y * scale);

    if (resizePixelBuffer || pixelWidth !== this._builtPixelWidth || pixelHeight !== this._builtPixelHeight) {
      this._canvasLayer.setPixelSize(pixelWidth, pixelHeight);
      this._builtPixelWidth = pixelWidth;
      this._builtPixelHeight = pixelHeight;
    } // Deliberately not repositioning the canvas here. interpolateField's
    // cost scales with this buffered region's area, and can take long
    // enough (a single synchronous burst, well within its own 1000ms
    // yield threshold) to visibly block a frame or two -- repositioning
    // the element immediately would move it to the new bounds while it's
    // still showing the *previous* bounds' content, which is exactly what
    // read as "reappearing in a different location." windy.start()'s
    // onReady callback repositions it at the same instant fresh content
    // actually becomes valid instead.


    var extent = [[bufferedBounds.getWest(), bufferedBounds.getSouth()], [bufferedBounds.getEast(), bufferedBounds.getNorth()]];

    this._windy.start([[0, 0], [pixelWidth, pixelHeight]], pixelWidth, pixelHeight, extent, zoom, function onReady() {
      self._canvasLayer.setBounds(bufferedBounds);
    });
  },
  _hardClear: function _hardClear() {
    if (this._context && this._canvasLayer._canvas) {
      this._context.clearRect(0, 0, this._canvasLayer._canvas.width, this._canvasLayer._canvas.height);
    }
  },
  _initMouseHandler: function _initMouseHandler(voidPrevious) {
    if (voidPrevious) {
      this._map.removeControl(this._mouseControl);

      this._mouseControl = false;
    }

    if (!this._mouseControl && this.options.displayValues) {
      var options = this.options.displayOptions || {};
      options["leafletVelocity"] = this;
      this._mouseControl = L.control.velocity(options).addTo(this._map);
    }
  },
  _destroyWind: function _destroyWind() {
    if (this._windy) this._windy.stop();

    this._hardClear();

    if (this._mouseControl) this._map.removeControl(this._mouseControl);
    this._mouseControl = null;
    this._windy = null;

    this._map.removeLayer(this._canvasLayer);
  }
});

L.velocityLayer = function (options) {
  return new L.VelocityLayer(options);
};
/*  Global class for simulating the movement of particle through a 1km wind grid

 credit: All the credit for this work goes to: https://github.com/cambecc for creating the repo:
 https://github.com/cambecc/earth. The majority of this code is directly take nfrom there, since its awesome.

 This class takes a canvas element and an array of data (1km GFS from http://www.emc.ncep.noaa.gov/index.php?branch=GFS)
 and then uses a mercator (forward/reverse) projection to correctly map wind vectors in "map space".

 The "start" method takes the bounds of the map at its current extent and starts the whole gridding,
 interpolation and animation process.
 */


var Windy = function Windy(params) {
  var MIN_VELOCITY_INTENSITY = params.minVelocity || 0; // velocity at which particle intensity is minimum (m/s)

  var MAX_VELOCITY_INTENSITY = params.maxVelocity || 10; // velocity at which particle intensity is maximum (m/s)

  var VELOCITY_SCALE = (params.velocityScale || 0.005) * (Math.pow(window.devicePixelRatio, 1 / 3) || 1); // scale for wind velocity (completely arbitrary--this value looks nice)

  var MAX_PARTICLE_AGE = params.particleAge || 90; // max number of frames a particle is drawn before regeneration

  var PARTICLE_LINE_WIDTH = params.lineWidth || 1; // line width of a drawn particle

  var PARTICLE_MULTIPLIER = params.particleMultiplier || 1 / 300; // particle count scalar (completely arbitrary--this values looks nice)

  var PARTICLE_REDUCTION = Math.pow(window.devicePixelRatio, 1 / 3) || 1.6; // multiply particle count for mobiles by this amount

  var FRAME_RATE = params.frameRate || 15;
  var FRAME_TIME = 1000 / FRAME_RATE; // desired frames per second

  var OPACITY = 0.97;
  var defaulColorScale = ["rgb(36,104, 180)", "rgb(60,157, 194)", "rgb(128,205,193 )", "rgb(151,218,168 )", "rgb(198,231,181)", "rgb(238,247,217)", "rgb(255,238,159)", "rgb(252,217,125)", "rgb(255,182,100)", "rgb(252,150,75)", "rgb(250,112,52)", "rgb(245,64,32)", "rgb(237,45,28)", "rgb(220,24,32)", "rgb(180,0,35)"];
  var colorScale = params.colorScale || defaulColorScale;
  var NULL_WIND_VECTOR = [NaN, NaN, null]; // singleton for no wind in the form: [u, v, magnitude]

  var builder;
  var grid;
  var gridData = params.data;
  var date;
  var λ0, φ0, Δλ, Δφ, ni, nj;

  var setData = function setData(data) {
    gridData = data;
  };

  var setOptions = function setOptions(options) {
    if (options.hasOwnProperty("minVelocity")) MIN_VELOCITY_INTENSITY = options.minVelocity;
    if (options.hasOwnProperty("maxVelocity")) MAX_VELOCITY_INTENSITY = options.maxVelocity;
    if (options.hasOwnProperty("velocityScale")) VELOCITY_SCALE = (options.velocityScale || 0.005) * (Math.pow(window.devicePixelRatio, 1 / 3) || 1);
    if (options.hasOwnProperty("particleAge")) MAX_PARTICLE_AGE = options.particleAge;
    if (options.hasOwnProperty("lineWidth")) PARTICLE_LINE_WIDTH = options.lineWidth;
    if (options.hasOwnProperty("particleMultiplier")) PARTICLE_MULTIPLIER = options.particleMultiplier;
    if (options.hasOwnProperty("opacity")) OPACITY = +options.opacity;
    if (options.hasOwnProperty("frameRate")) FRAME_RATE = options.frameRate;
    FRAME_TIME = 1000 / FRAME_RATE;
  }; // interpolation for vectors like wind (u,v,m)


  var bilinearInterpolateVector = function bilinearInterpolateVector(x, y, g00, g10, g01, g11) {
    var rx = 1 - x;
    var ry = 1 - y;
    var a = rx * ry,
        b = x * ry,
        c = rx * y,
        d = x * y;
    var u = g00[0] * a + g10[0] * b + g01[0] * c + g11[0] * d;
    var v = g00[1] * a + g10[1] * b + g01[1] * c + g11[1] * d;
    return [u, v, Math.sqrt(u * u + v * v)];
  };

  var createWindBuilder = function createWindBuilder(uComp, vComp) {
    var uData = uComp.data,
        vData = vComp.data;
    return {
      header: uComp.header,
      //recipe: recipeFor("wind-" + uComp.header.surface1Value),
      data: function data(i) {
        return [uData[i], vData[i]];
      },
      interpolate: bilinearInterpolateVector
    };
  };

  var createBuilder = function createBuilder(data) {
    var uComp = null,
        vComp = null,
        scalar = null;
    data.forEach(function (record) {
      switch (record.header.parameterCategory + "," + record.header.parameterNumber) {
        case "1,2":
        case "2,2":
          uComp = record;
          break;

        case "1,3":
        case "2,3":
          vComp = record;
          break;

        default:
          scalar = record;
      }
    });
    return createWindBuilder(uComp, vComp);
  };

  var buildGrid = function buildGrid(data, callback) {
    var supported = true;
    if (data.length < 2) supported = false;
    if (!supported) console.log("Windy Error: data must have at least two components (u,v)");
    builder = createBuilder(data);
    var header = builder.header;
    if (header.hasOwnProperty("gridDefinitionTemplate") && header.gridDefinitionTemplate != 0) supported = false;

    if (!supported) {
      console.log("Windy Error: Only data with Latitude_Longitude coordinates is supported");
    }

    supported = true; // reset for futher checks

    λ0 = header.lo1;
    φ0 = header.la1; // the grid's origin (e.g., 0.0E, 90.0N)

    Δλ = header.dx;
    Δφ = header.dy; // distance between grid points (e.g., 2.5 deg lon, 2.5 deg lat)

    ni = header.nx;
    nj = header.ny; // number of grid points W-E and N-S (e.g., 144 x 73)

    if (header.hasOwnProperty("scanMode")) {
      var scanModeMask = header.scanMode.toString(2);
      scanModeMask = ('0' + scanModeMask).slice(-8);
      var scanModeMaskArray = scanModeMask.split('').map(Number).map(Boolean);
      if (scanModeMaskArray[0]) Δλ = -Δλ;
      if (scanModeMaskArray[1]) Δφ = -Δφ;
      if (scanModeMaskArray[2]) supported = false;
      if (scanModeMaskArray[3]) supported = false;
      if (scanModeMaskArray[4]) supported = false;
      if (scanModeMaskArray[5]) supported = false;
      if (scanModeMaskArray[6]) supported = false;
      if (scanModeMaskArray[7]) supported = false;
      if (!supported) console.log("Windy Error: Data with scanMode: " + header.scanMode + " is not supported.");
    }

    date = new Date(header.refTime);
    date.setHours(date.getHours() + header.forecastTime); // Scan modes 0, 64 allowed.
    // http://www.nco.ncep.noaa.gov/pmb/docs/grib2/grib2_table3-4.shtml

    grid = [];
    var p = 0;
    var isContinuous = Math.floor(ni * Δλ) >= 360;

    for (var j = 0; j < nj; j++) {
      var row = [];

      for (var i = 0; i < ni; i++, p++) {
        row[i] = builder.data(p);
      }

      if (isContinuous) {
        // For wrapped grids, duplicate first column as last column to simplify interpolation logic
        row.push(row[0]);
      }

      grid[j] = row;
    }

    callback({
      date: date,
      interpolate: interpolate
    });
  };
  /**
   * Get interpolated grid value from Lon/Lat position
   * @param λ {Float} Longitude
   * @param φ {Float} Latitude
   * @returns {Object}
   */


  var interpolate = function interpolate(λ, φ) {
    if (!grid) return null;
    var i = floorMod(λ - λ0, 360) / Δλ; // calculate longitude index in wrapped range [0, 360)

    var j = (φ0 - φ) / Δφ; // calculate latitude index in direction +90 to -90

    var fi = Math.floor(i),
        ci = fi + 1;
    var fj = Math.floor(j),
        cj = fj + 1;
    var row;

    if (row = grid[fj]) {
      var g00 = row[fi];
      var g10 = row[ci];

      if (isValue(g00) && isValue(g10) && (row = grid[cj])) {
        var g01 = row[fi];
        var g11 = row[ci];

        if (isValue(g01) && isValue(g11)) {
          // All four points found, so interpolate the value.
          return builder.interpolate(i - fi, j - fj, g00, g10, g01, g11);
        }
      }
    }

    return null;
  };
  /**
   * @returns {Boolean} true if the specified value is not null and not undefined.
   */


  var isValue = function isValue(x) {
    return x !== null && x !== undefined;
  };
  /**
   * @returns {Number} returns remainder of floored division, i.e., floor(a / n). Useful for consistent modulo
   *          of negative numbers. See http://en.wikipedia.org/wiki/Modulo_operation.
   */


  var floorMod = function floorMod(a, n) {
    return a - n * Math.floor(a / n);
  };
  /**
   * @returns {Number} the value x clamped to the range [low, high].
   */


  var clamp = function clamp(x, range) {
    return Math.max(range[0], Math.min(x, range[1]));
  };
  /**
   * @returns {Boolean} true if agent is probably a mobile device. Don't really care if this is accurate.
   */


  var isMobile = function isMobile() {
    return /android|blackberry|iemobile|ipad|iphone|ipod|opera mini|webos/i.test(navigator.userAgent);
  };
  /**
   * Calculate distortion of the wind vector caused by the shape of the projection at point (x, y). The wind
   * vector is modified in place and returned by this function.
   */


  var distort = function distort(projection, λ, φ, x, y, scale, wind) {
    var u = wind[0] * scale;
    var v = wind[1] * scale;
    var d = distortion(projection, λ, φ, x, y); // Scale distortion vectors by u and v, then add.

    wind[0] = d[0] * u + d[2] * v;
    wind[1] = d[1] * u + d[3] * v;
    return wind;
  };

  var distortion = function distortion(projection, λ, φ, x, y) {
    var τ = 2 * Math.PI; //    var H = Math.pow(10, -5.2); // 0.00000630957344480193
    //    var H = 0.0000360;          // 0.0000360°φ ~= 4m  (from https://github.com/cambecc/earth/blob/master/public/libs/earth/1.0.0/micro.js#L13)

    var H = 5; // ToDo:   Why does this work?

    var hλ = λ < 0 ? H : -H;
    var hφ = φ < 0 ? H : -H;
    var pλ = project(φ, λ + hλ);
    var pφ = project(φ + hφ, λ); // Meridian scale factor (see Snyder, equation 4-3), where R = 1. This handles issue where length of 1º λ
    // changes depending on φ. Without this, there is a pinching effect at the poles.

    var k = Math.cos(φ / 360 * τ);
    return [(pλ[0] - x) / hλ / k, (pλ[1] - y) / hλ / k, (pφ[0] - x) / hφ, (pφ[1] - y) / hφ];
  };

  var createField = function createField(columns, bounds, callback) {
    /**
     * @returns {Array} wind vector [u, v, magnitude] at the point (x, y), or [NaN, NaN, null] if wind
     *          is undefined at that point.
     */
    function field(x, y) {
      var column = columns[Math.round(x)];
      return column && column[Math.round(y)] || NULL_WIND_VECTOR;
    } // Frees the massive "columns" array for GC. Without this, the array is leaked (in Chrome) each time a new
    // field is interpolated because the field closure's context is leaked, for reasons that defy explanation.


    field.release = function () {
      columns = [];
    };

    field.randomize = function (o) {
      // UNDONE: this method is terrible
      var x, y;
      var safetyNet = 0;

      do {
        x = Math.round(Math.floor(Math.random() * bounds.width) + bounds.x);
        y = Math.round(Math.floor(Math.random() * bounds.height) + bounds.y);
      } while (field(x, y)[2] === null && safetyNet++ < 30);

      o.x = x;
      o.y = y;
      return o;
    };

    callback(bounds, field);
  };

  var buildBounds = function buildBounds(bounds, width, height) {
    var upperLeft = bounds[0];
    var lowerRight = bounds[1];
    var x = Math.round(upperLeft[0]); //Math.max(Math.floor(upperLeft[0], 0), 0);

    var y = Math.max(Math.floor(upperLeft[1], 0), 0);
    var xMax = Math.min(Math.ceil(lowerRight[0], width), width - 1);
    var yMax = Math.min(Math.ceil(lowerRight[1], height), height - 1);
    return {
      x: x,
      y: y,
      xMax: width,
      yMax: yMax,
      width: width,
      height: height
    };
  };

  var deg2rad = function deg2rad(deg) {
    return deg / 180 * Math.PI;
  };

  // referenceZoom/originPoint anchor this canvas's internal pixel space to
  // a fixed geographic frame instead of the current viewport: set once per
  // rebuild (see start(), below) from map.project(bounds.getNorthWest(),
  // zoomAtBuildTime) -- a pure function of (latlng, zoom) that Leaflet
  // itself uses for tile positioning, entirely independent of the current
  // pan position. Panning the map afterward doesn't change what these
  // functions compute at all, which is the whole point: this content
  // doesn't need to know a pan happened, because it was never expressed in
  // viewport-relative terms to begin with. (A zoom *does* invalidate this
  // frame -- see the rebuild-on-zoom logic in VelocityLayer.)
  var referenceZoom = null;
  var originPoint = null;

  var invert = function invert(x, y, windy) {
    if (referenceZoom === null) return null;
    var latlon = params.map.unproject(L.point(x + originPoint.x, y + originPoint.y), referenceZoom);
    return [latlon.lng, latlon.lat];
  };

  var project = function project(lat, lon, windy) {
    if (referenceZoom === null) return null;
    var xy = params.map.project(L.latLng(lat, lon), referenceZoom);
    return [xy.x - originPoint.x, xy.y - originPoint.y];
  };

  // Pixel spacing at which the background velocity lookup grid is actually
  // sampled -- the rest of the pixels in each step are just filled with the
  // nearest computed value (see the dx/dy fill loops below), not
  // recomputed. Originally ran at a fixed 2px step regardless of viewport
  // size, causing several ~70ms main-thread violations on every single
  // restart (measured in production); 4px roughly quarters that cost.
  //
  // Deliberately NOT raised further to compensate for VelocityLayer now
  // building a buffered region larger than a single viewport (see
  // BUFFER_RATIO) -- a coarser step doesn't just lose lookup-grid
  // precision in open water (harmless, since real currents vary smoothly
  // over tens of meters), it also widens the "bleed" radius of the
  // land/water mask at every coastline: a single sample that happens to
  // land on water fills the *entire* step x step block around it with
  // that water value, even where part of that block is actually land on
  // the basemap. Raising this to 8px to afford a larger buffer reintroduced
  // exactly that as a real, visible bug (current visibly crossing onto
  // land); BUFFER_RATIO is what actually got tuned down to compensate for
  // cost instead, since shrinking the buffer doesn't cost any precision.
  var FIELD_PIXEL_STEP = 4;

  var interpolateField = function interpolateField(grid, bounds, extent, callback) {
    var projection = {}; // map.crs used instead

    var mapArea = (extent.south - extent.north) * (extent.west - extent.east);
    var velocityScale = VELOCITY_SCALE * Math.pow(mapArea, 0.4);
    var columns = [];
    var x = bounds.x;

    function interpolateColumn(x) {
      var column = [];

      for (var y = bounds.y; y <= bounds.yMax; y += FIELD_PIXEL_STEP) {
        var coord = invert(x, y);

        if (coord) {
          var λ = coord[0],
              φ = coord[1];

          if (isFinite(λ)) {
            var wind = grid.interpolate(λ, φ);

            if (wind) {
              wind = distort(projection, λ, φ, x, y, velocityScale, wind);

              for (var dy = 0; dy < FIELD_PIXEL_STEP; dy++) column[y + dy] = wind;
            }
          }
        }
      }

      for (var dx = 0; dx < FIELD_PIXEL_STEP; dx++) columns[x + dx] = column;
    }

    (function batchInterpolate() {
      var start = Date.now();

      while (x < bounds.width) {
        interpolateColumn(x);
        x += FIELD_PIXEL_STEP;

        if (Date.now() - start > 1000) {
          //MAX_TASK_TIME) {
          setTimeout(batchInterpolate, 25);
          return;
        }
      }

      createField(columns, bounds, callback);
    })();
  };

  var animationLoop;
  // Two separate counters, deliberately not one:
  //
  // currentGeneration bumps on every start() call -- it marks "the latest
  // requested rebuild." Each in-flight buildGrid/interpolateField callback
  // chain captures the value current at its own start() and checks it
  // before proceeding, so if a newer start() comes in before an older
  // chain finishes (interpolateField explicitly chunks itself across
  // setTimeout calls for large fields, so this is common), the stale one
  // drops its result instead of handing it to the next stage. Without
  // this, two independent frame() loops could end up running at once,
  // sharing the single `animationLoop` variable so cancelAnimationFrame
  // could only ever cancel whichever most recently overwrote it -- any
  // other leaks forever, drawing with stale bounds and re-applying
  // draw()'s destination-in fade on top of the other loop(s)' fade every
  // real frame, compounding it. That's what made rapid pan/zoom
  // interactions eventually break zoom outright and made trails vanish far
  // faster than intended.
  //
  // activeGeneration marks which generation's frame() loop is actually
  // allowed to keep animating. It's what frame() itself checks -- not
  // currentGeneration -- and it only advances once a rebuild has *finished*
  // and is ready to swap in, not the instant a new one is merely
  // requested. That distinction is what lets any rebuild (a plain pan
  // exceeding the buffered region, or a zoom) keep the previous, still-
  // valid field animating uninterrupted in the background instead of
  // stopping everything immediately and leaving nothing on screen until
  // the new one is ready. A zoom doesn't need a separate freeze the way it
  // once did: CanvasLayer._animateZoom already CSS-transforms the whole
  // canvas element (translate + scale) to track the zoom transition
  // visually, so whatever's still being drawn underneath in the old
  // coordinate space gets carried along with it, the same way a tile
  // looks correct (if a little soft) mid-zoom before a sharper one loads.
  // stop() itself is now only ever called on layer teardown (see
  // _destroyWind) -- every rebuild, pan or zoom, goes through start()'s
  // own generation-swap logic below instead.
  var currentGeneration = 0;
  var activeGeneration = 0;

  // How many virtual frames of trail buildup to pre-render offscreen before
  // a generation swap reveals itself, and how many of those to run per real
  // animation-frame tick (batching several per tick so the wall-clock delay
  // before cutover stays short even though full trail density -- governed
  // by OPACITY's per-frame decay -- would otherwise take dozens of frames to
  // approach). See the priming block inside animate() for how this is used.
  var PRIME_TICKS = 15;
  var PRIME_STEPS_PER_TICK = 4;

  var animate = function animate(bounds, field, myGeneration, onReady) {
    function windIntensityColorScale(min, max) {
      colorScale.indexFor = function (m) {
        // map velocity speed to a style
        return Math.max(0, Math.min(colorScale.length - 1, Math.round((m - min) / (max - min) * (colorScale.length - 1))));
      };

      return colorScale;
    }

    var colorStyles = windIntensityColorScale(MIN_VELOCITY_INTENSITY, MAX_VELOCITY_INTENSITY);
    var buckets = colorStyles.map(function () {
      return [];
    });
    var particleCount = Math.round(bounds.width * bounds.height * PARTICLE_MULTIPLIER);

    if (isMobile()) {
      particleCount *= PARTICLE_REDUCTION;
    }

    var fadeFillStyle = "rgba(0, 0, 0, ".concat(OPACITY, ")");
    var particles = [];

    for (var i = 0; i < particleCount; i++) {
      particles.push(field.randomize({
        age: Math.floor(Math.random() * MAX_PARTICLE_AGE) + 0
      }));
    }

    function evolve() {
      buckets.forEach(function (bucket) {
        bucket.length = 0;
      });
      particles.forEach(function (particle) {
        if (particle.age > MAX_PARTICLE_AGE) {
          field.randomize(particle).age = 0;
        }

        var x = particle.x;
        var y = particle.y;
        var v = field(x, y); // vector at current position

        var m = v[2];

        if (m === null) {
          particle.age = MAX_PARTICLE_AGE; // particle has escaped the grid, never to return...
        } else {
          var xt = x + v[0];
          var yt = y + v[1];

          if (field(xt, yt)[2] !== null) {
            // Path from (x,y) to (xt,yt) is visible, so add this particle to the appropriate draw bucket.
            particle.xt = xt;
            particle.yt = yt;
            buckets[colorStyles.indexFor(m)].push(particle);
          } else {
            // Particle isn't visible, but it still moves through the field.
            particle.x = xt;
            particle.y = yt;
          }
        }

        particle.age += 1;
      });
    }

    // Takes the target 2D context explicitly rather than closing over one --
    // priming draws into a scratch offscreen canvas, the real frame loop
    // (below, after cutover) draws into params.canvas, and both need this
    // same fade+stroke logic.
    function draw(context) {
      context.lineWidth = PARTICLE_LINE_WIDTH; // Fade existing particle trails.

      context.fillStyle = fadeFillStyle;
      context.globalCompositeOperation = "destination-in";
      context.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
      context.globalCompositeOperation = "source-over";
      context.globalAlpha = OPACITY === 0 ? 0 : OPACITY * 0.9; // Draw new particle trails.

      buckets.forEach(function (bucket, i) {
        if (bucket.length > 0) {
          context.beginPath();
          context.strokeStyle = colorStyles[i];
          bucket.forEach(function (particle) {
            context.moveTo(particle.x, particle.y);
            context.lineTo(particle.xt, particle.yt);
            particle.x = particle.xt;
            particle.y = particle.yt;
          });
          context.stroke();
        }
      });
    }

    // Prime an offscreen buffer with several virtual frames of trail
    // buildup before this generation ever touches the visible canvas.
    // draw() only ever partially fades the previous frame (destination-in),
    // so a canvas that's just been hard-cleared reads as sparse/blank for
    // quite a few real frames while trails accumulate back up to steady
    // density -- exactly the "blank frame or two" on every rebuild. Priming
    // offscreen means whatever's currently on the *visible* canvas (the
    // previous generation, if any) is left completely undisturbed and kept
    // animating right up until this generation is already fully populated
    // and ready to reveal in one shot.
    var primeCanvas = document.createElement("canvas");
    primeCanvas.width = params.canvas.width;
    primeCanvas.height = params.canvas.height;
    var primeCtx = primeCanvas.getContext("2d");
    var primeTicksDone = 0;

    (function primeFrame() {
      // A newer start() superseded this one before it ever got to reveal
      // itself -- die quietly, same as the frame() loop's own check below.
      if (myGeneration !== currentGeneration) return;

      for (var step = 0; step < PRIME_STEPS_PER_TICK; step++) {
        evolve();
        draw(primeCtx);
      }

      primeTicksDone += 1;

      if (primeTicksDone < PRIME_TICKS) {
        requestAnimationFrame(primeFrame);
        return;
      } // Priming is done -- cut over now: retire whatever was previously
      // active (if anything), reveal this generation's already-populated
      // buffer in a single paint (no partial-fade blank period on the real
      // canvas at all), and keep the same particles animating forward from
      // here via the normal frame loop.


      if (windy.field) windy.field.release();
      if (animationLoop) cancelAnimationFrame(animationLoop);
      var g = params.canvas.getContext("2d");
      g.clearRect(0, 0, params.canvas.width, params.canvas.height);
      g.drawImage(primeCanvas, 0, 0);
      activeGeneration = myGeneration;
      windy.field = field;
      var then = Date.now();

      (function frame() {
        // A newer rebuild has actually finished and taken over since this
        // loop started -- die quietly instead of continuing to fight the
        // newer loop for the canvas and the shared `animationLoop`
        // variable. (Checked against activeGeneration, not
        // currentGeneration -- see the comment where these are declared.)
        if (myGeneration !== activeGeneration) return;
        animationLoop = requestAnimationFrame(frame);
        var now = Date.now();
        var delta = now - then;

        if (delta > FRAME_TIME) {
          then = now - delta % FRAME_TIME;
          evolve();
          draw(g);
        }
      })(); // Fresh content just became valid *and visible* -- tell the caller
      // (VelocityLayer._rebuild) so it can reposition the canvas element in
      // the same breath, instead of moving it before this generation was
      // ready to be seen.


      if (onReady) onReady();
    })();
  };

  var start = function start(bounds, width, height, extent, refZoomAtBuild, onReady) {
    var mapBounds = {
      south: deg2rad(extent[0][1]),
      north: deg2rad(extent[1][1]),
      east: deg2rad(extent[1][0]),
      west: deg2rad(extent[0][0]),
      width: width,
      height: height
    }; // Fix this rebuild's reference frame *before* any interpolation runs --
    // invert()/project() (used throughout buildGrid/interpolateField) read
    // referenceZoom/originPoint directly. Canvas-local (0,0) is defined to
    // be extent's northwest corner at refZoomAtBuild, matching exactly what
    // CanvasLayer._reset() positions the element's own (0,0) at (see the
    // comment there) -- this is what keeps the two consistent.

    referenceZoom = refZoomAtBuild;
    originPoint = params.map.project(L.latLng(extent[1][1], extent[0][0]), refZoomAtBuild); // Deliberately not calling stop() here, for a pan-triggered rebuild or a
    // zoom-triggered one alike. Whatever's currently animating
    // (activeGeneration's loop, if any) keeps running exactly as-is --
    // against its own now slightly-stale bounds/field -- while this
    // rebuild happens in the background. Real currents don't meaningfully
    // change over however long a rebuild takes (a single-digit-to-low-
    // tens-of-milliseconds synchronous burst -- see FIELD_PIXEL_STEP), so
    // a moment of animating against the pre-rebuild field is
    // imperceptible. Only once the rebuild actually finishes do we cut
    // over to it, below.
    currentGeneration += 1;
    var myGeneration = currentGeneration; // build grid

    buildGrid(gridData, function (grid) {
      // A newer start() was called while this (async, possibly chunked-
      // across-multiple-setTimeouts) buildGrid was still running -- its
      // result is for a stale view/bounds, so drop it instead of handing
      // it to interpolateField.
      if (myGeneration !== currentGeneration) return; // interpolateField

      interpolateField(grid, buildBounds(bounds, width, height), mapBounds, function (bounds, field) {
        // Same check again -- interpolateField itself yields across
        // multiple setTimeout batches for large fields, so a newer start()
        // can just as easily supersede this call while it's still running.
        if (myGeneration !== currentGeneration) return; // The actual cutover (releasing the old field, cancelling its loop,
        // publishing this as the active generation, and calling onReady) is
        // deferred until animate() has finished priming an offscreen buffer
        // for this generation -- see the priming block there for why:
        // revealing this generation the instant its field finishes
        // computing, before it has any accumulated trail density, is
        // exactly what read as a blank/sparse flash on every rebuild.

        animate(bounds, field, myGeneration, onReady);
      });
    });
  };

  var stop = function stop() {
    // Only ever called directly on layer teardown (see _destroyWind) --
    // every rebuild, whether from a pan or a zoom, goes through start()'s
    // own generation-swap instead, which keeps the previous field
    // animating until the new one is actually ready rather than stopping
    // immediately like this does.
    currentGeneration += 1;
    activeGeneration = currentGeneration; // nothing further should animate under any older generation
    if (windy.field) windy.field.release();
    if (animationLoop) cancelAnimationFrame(animationLoop);
  };

  var windy = {
    params: params,
    start: start,
    stop: stop,
    createField: createField,
    interpolatePoint: interpolate,
    setData: setData,
    setOptions: setOptions
  };
  return windy;
};

if (!window.cancelAnimationFrame) {
  window.cancelAnimationFrame = function (id) {
    clearTimeout(id);
  };
}