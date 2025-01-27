import * as PIXI from 'pixi.js';
import { interpolateNumber } from 'd3-interpolate';
import { AdjustmentFilter, ConvolutionFilter } from 'pixi-filters';
import { Tiler, vecScale } from '@rapid-sdk/math';

import { AbstractLayer } from './AbstractLayer.js';

const DEBUGCOLOR = 0xffff00;

// scalars for use by the convolution filter to sharpen the imagery
const sharpenMatrix = [
     0,      -0.0125,      0,
  -0.0125,    0.5,      -0.0125,
     0,      -0.0125,      0
];


/**
 * PixiLayerBackgroundTiles
 * @class
 */
export class PixiLayerBackgroundTiles extends AbstractLayer {

  /**
   * @constructor
   * @param  scene      The Scene that owns this Layer
   * @param  layerID    Unique string to use for the name of this Layer
   * @param  isMinimap  Pass `true` if this layer should be attached to the minimap
   */
  constructor(scene, layerID, isMinimap) {
    super(scene, layerID);
    this.enabled = true;   // background imagery should be enabled by default
    this.isMinimap = isMinimap;

    this.filters = {
      brightness: 1,
      contrast: 1,
      saturation: 1,
      sharpness: 1,
    };

    this._tileMaps = new Map();    // Map (sourceID -> Map(tileID -> tile))
    this._failed = new Set();      // Set of failed tileURLs
    this._tiler = new Tiler();
  }


  /**
   * reset
   * Every Layer should have a reset function to replace any Pixi objects and internal state.
   */
  reset() {
    super.reset();

    // Items in this layer don't need to be interactive
    const groupContainer = this.scene.groups.get('background');
    groupContainer.eventMode = 'none';

    this.destroyAll();
    this._tileMaps.clear();
    this._failed.clear();
  }


  /**
   * render
   * @param  frame      Integer frame being rendered
   * @param  viewport   Pixi viewport to use for rendering
   */
  render(frame, viewport) {
    const imagery = this.context.systems.imagery;
    const groupContainer = this.scene.groups.get('background');

    // Collect tile sources - baselayer and overlays
    const showSources = new Map();   // Map (sourceID -> source)

    const base = imagery.baseLayerSource();
    const baseID = base?.key;   // note: use `key` here - for Wayback it will include the date
    if (base && baseID !== 'none') {
      showSources.set(baseID, base);
    }

    for (const overlay of imagery.overlayLayerSources()) {
      showSources.set(overlay.id, overlay);
    }

    // Render each tile source (iterates in insertion order, base then overlays)
    let index = 0;
    for (const [sourceID, source] of showSources) {
      const sourceContainer = this.getSourceContainer(sourceID);
      sourceContainer.zIndex = (source.isLocatorOverlay() ? 999 : index++);

      // If this is the base tile layer (and not minimap) apply the filters to it.
      if (!this.isMinimap && source === base) {
        this.applyFilters(sourceContainer);
      }

      let tileMap = this._tileMaps.get(sourceID);
      if (!tileMap) {
        tileMap = new Map();   // Map (tileID -> Tile)
        this._tileMaps.set(sourceID, tileMap);
      }

      const timestamp = window.performance.now();
      this.renderSource(timestamp, viewport, source, sourceContainer, tileMap);
    }

    // Remove any sourceContainers and data not needed anymore
    // Doing this in 2 passes to avoid affecting `.children` while iterating over it.
    const toDestroy = new Set();
    for (const sourceContainer of groupContainer.children) {
      const sourceID = sourceContainer.label;
      if (!showSources.has(sourceID)) {
        toDestroy.add(sourceID);
      }
    }

    for (const sourceID of toDestroy) {
      this.destroySource(sourceID);
    }
  }


  /**
   * renderSource
   * @param timestamp        Timestamp in milliseconds
   * @param viewport         Pixi viewport to use for rendering
   * @param source           Imagery tile source Object
   * @param sourceContainer  PIXI.Container to render the tiles to
   * @param tileMap          Map(tile.id -> Tile) for this tile source
   */
  renderSource(timestamp, viewport, source, sourceContainer, tileMap) {
    const context = this.context;
    const textureManager = this.gfx.textures;
    const osm = context.services.osm;
    const t = viewport.transform.props;
    const sourceID = source.key;   // note: use `key` here, for Wayback it will include the date

    // Defensive coding in case nominatim/other reasons cause us to get an invalid view transform.
    if (isNaN(t.x) || isNaN(t.y)) {
      return;
    }

    // The tile debug container lives on the `map-ui` layer so it is drawn over everything
    let showDebug = false;
    let debugContainer;
    if (!this.isMinimap) {
      showDebug = context.getDebug('tile');
      debugContainer = this.scene.layers.get('map-ui').tileDebug;
      debugContainer.visible = showDebug;
    }

// worldcoordinates
    const tileSize = source.tileSize || 256;
//    const z = geoScaleToZoom(t.k, tileSize);  // Use actual zoom for this, not effective zoom
    const log2ts = Math.log2(tileSize);
    const z = t.z - (log2ts - 8);   // adjust zoom for tile sizes not 256px (log2(256) = 8)

    // Apply imagery offset (in pixels) to the source container
    const offset = vecScale(source.offset, Math.pow(2, z));
    sourceContainer.position.set(offset[0], offset[1]);

    // Determine tiles needed to cover the view at the zoom we want,
    // including any zoomed out tiles if this field contains any holes
    const needTiles = new Map();                // Map(tileID -> tile)

    // Make sure the min zoom is at least 1.
    // z=0 causes a bug for Mapbox layers to disappear, these use very large tile size.
    // Also the locator overlay should always show its labels, which start at zoom 1.
    const maxZoom = Math.max(1, Math.ceil(z));                 // the zoom we want (round up for sharper imagery)
    const minZoom = Math.max(1, maxZoom - source.zoomRange);   // the mininimum zoom we'll accept

    let covered = false;
    for (let tryZoom = maxZoom; !covered && tryZoom >= minZoom; tryZoom--) {
      if (!source.validZoom(tryZoom)) continue;  // not valid here, zoom out
      if (source.isLocatorOverlay() && maxZoom > 17) continue;   // overlay is blurry if zoomed in this far

      const result = this._tiler
        .tileSize(tileSize)
        .skipNullIsland(!!source.overlay)
        .zoomRange(tryZoom)
        .getTiles(this.isMinimap ? viewport : context.viewport);  // minimap passes in its own viewport

      let hasHoles = false;
      for (const tile of result.tiles) {
        // skip locator overlay tiles where we have osm data loaded there
        if (!this.isMinimap && tryZoom >= 10 && osm && source.isLocatorOverlay()) {
          const loc = tile.wgs84Extent.center();
          if (osm.isDataLoaded(loc)) continue;
        }

        tile.url = source.url(tile.xyz);
        if (!tile.url || this._failed.has(tile.url)) {
          hasHoles = true;   // url invalid or has failed in the past
        } else {
          needTiles.set(tile.id, tile);
        }
      }
      covered = !hasHoles;
    }


    // Create a Sprite for each tile
    for (const [tileID, tile] of needTiles) {
      if (tileMap.has(tileID)) continue;   // we made it already

      const tileName = `${sourceID}-${tileID}`;
      const sprite = new PIXI.Sprite();
      sprite.label = tileName;

// worldcoordinates
//      sprite.anchor.set(0, 1);    // left, bottom
sprite.anchor.set(0, 0);  // left, top
      sprite.zIndex = tile.xyz[2];   // draw zoomed tiles above unzoomed tiles
      sprite.alpha = source.alpha;
      sourceContainer.addChild(sprite);
      tile.sprite = sprite;
      tileMap.set(tileID, tile);

      // Start loading the image
      const image = new Image();
      image.crossOrigin = 'anonymous';
      image.src = tile.url;
      tile.image = image;
      tile.loaded = false;

      // After the image loads, allocate space for it in the texture atlas
      image.onload = () => {
        this._failed.delete(tile.url);
        if (!tile.sprite || !tile.image) return;  // it's possible that the tile isn't needed anymore and got pruned

        const w = tile.image.naturalWidth;
        const h = tile.image.naturalHeight;
        tile.sprite.texture = textureManager.allocate('tile', tile.sprite.label, w, h, tile.image);

        tile.loaded = true;
        tile.image = null;  // reference to `image` is held by the atlas, we can null it
        this.gfx.deferredRedraw();
      };

      image.onerror = () => {
        tile.image = null;
        this._failed.add(tile.url);
        this.gfx.deferredRedraw();
      };
    }


    // Update or remove the existing tiles
    for (const [tileID, tile] of tileMap) {
      let keepTile = false;

      // Keep this tile if it is in the `needTiles` map.
      if (needTiles.has(tileID)) {
        keepTile = true;
        tile.timestamp = timestamp;

      // Keep base (not overlay) tiles around a little while longer,
      // so they can stand in for a needed tile that has not loaded yet.
      } else if (!source.overlay) {
        keepTile = (timestamp - tile.timestamp < 3000);  // 3 sec
      }

      if (keepTile) {   // Tile may be visible - update position and scale
// worldcoordinates
        // const [x, y] = viewport.project(tile.wgs84Extent.min);   // left, bottom
const [x, y] = viewport.worldToScreen(tile.tileExtent.min);  // left top

        tile.sprite.position.set(x, y);
        const size = tileSize * Math.pow(2, z - tile.xyz[2]);
        tile.sprite.width = size;
        tile.sprite.height = size;

        if (showDebug && debugContainer && !source.overlay) {
          // Display debug tile info
          if (!tile.debug) {
            tile.debug = new PIXI.Graphics();
            tile.debug.label = `debug-${tileID}`;
            tile.debug.eventMode = 'none';
            debugContainer.addChild(tile.debug);
          }

          if (!tile.text) {
            tile.text = new PIXI.BitmapText({
              text: tileID,
              style: {
                fontFamily: 'rapid-debug',
                fontSize: 14
              }
            });

            tile.text.label = `label-${tileID}`;
            tile.text.tint = DEBUGCOLOR;
            tile.text.eventMode = 'none';
            debugContainer.addChild(tile.text);
          }

          tile.debug.position.set(x, y - size);         // left, top
          tile.text.position.set(x + 2, y - size + 2);  // left, top
          tile.debug
            .clear()
            .rect(0, 0, size, size)
            .stroke({ width: 2, color: DEBUGCOLOR });
        }

      } else {   // tile not needed, can destroy it
        this.destroyTile(tile);
        tileMap.delete(tileID);
      }
    }

  }


  /**
   * destroyAll
   * Frees all the resources used by all sources
   */
  destroyAll() {
    const groupContainer = this.scene.groups.get('background');

    // Doing this in 2 passes to avoid affecting `.children` while iterating over it.
    const toDestroy = new Set();
    for (const sourceContainer of groupContainer.children) {
      const sourceID = sourceContainer.label;
      toDestroy.add(sourceID);
    }

    for (const sourceID of toDestroy) {
      this.destroySource(sourceID);
    }
  }


  /**
   * destroySource
   * Frees all the resources used by a source
   * @param  sourceID
   */
  destroySource(sourceID) {
    const tileMap = this._tileMaps.get(sourceID);
    for (const [tileID, tile] of tileMap) {
      this.destroyTile(tile);
      tileMap.delete(tileID);
    }
    this._tileMaps.delete(sourceID);

    const groupContainer = this.scene.groups.get('background');
    let sourceContainer = groupContainer.getChildByLabel(sourceID);
    if (sourceContainer) {
      sourceContainer.destroy({ children: true });
    }
  }


  /**
   * destroyTile
   * Frees all the resources used by a tile
   * @param  tile  Tile object
   */
  destroyTile(tile) {
    const textureManager = this.gfx.textures;

    if (tile.sprite) {
      if (tile.loaded) {
        textureManager.free('tile', tile.sprite.label);
      }
      tile.sprite.destroy({ texture: true, textureSource: false });
    }

    if (tile.debug) {
      tile.debug.destroy();
    }
    if (tile.text) {
      tile.text.destroy();
    }

    tile.image = null;
    tile.sprite = null;
    tile.debug = null;
    tile.text = null;
  }


  /**
   * getSourceContainer
   * Gets a PIXI.Container to hold the tiles for the given sourceID, creating one if needed
   * @param   sourceID
   * @return  a PIXI.Container
   */
  getSourceContainer(sourceID) {
    const groupContainer = this.scene.groups.get('background');
    let sourceContainer = groupContainer.getChildByLabel(sourceID);
    if (!sourceContainer) {
      sourceContainer = new PIXI.Container();
      sourceContainer.label = sourceID;
      sourceContainer.eventMode = 'none';
      sourceContainer.sortableChildren = true;
      groupContainer.addChild(sourceContainer);
    }
    return sourceContainer;
  }


  /**
   * applyFilters
   * Adds an adjustment filter for brightness/contrast/saturation and
   * a sharpen/blur filter, depending on the UI slider settings.
   * @param  sourceContainer   PIXI.Container that contains the tiles
   */
  applyFilters(sourceContainer) {
    const adjustmentFilter = new AdjustmentFilter({
      brightness: this.filters.brightness,
      contrast: this.filters.contrast,
      saturation: this.filters.saturation,
    });

    sourceContainer.filters = [adjustmentFilter];

    if (this.filters.sharpness > 1) {
      // The convolution filter consists of adjacent pixels with a negative factor and the central pixel being at least one.
      // The central pixel (at index 4 of our 3x3 array) starts at 1 and increases
      const convolutionArray = sharpenMatrix.map((n, i) => {
        if (i === 4) {
          const interp = interpolateNumber(1, 2)(this.filters.sharpness);
          const result = n * interp;
          return result;
        } else {
          return n;
        }
      });

      this.convolutionFilter = new ConvolutionFilter(convolutionArray);
      sourceContainer.filters= [...sourceContainer.filters, this.convolutionFilter];

    } else if (this.filters.sharpness < 1) {
      const blurFactor = interpolateNumber(1, 8)(1 - this.filters.sharpness);
      this.blurFilter = new PIXI.BlurFilter({
        strength: blurFactor,
        quality: 4
      });
      sourceContainer.filters = [...sourceContainer.filters, this.blurFilter];
    }
  }


  setBrightness(val) {
    this.filters.brightness = val;
  }

  setContrast(val) {
    this.filters.contrast = val;
  }

  setSaturation(val) {
    this.filters.saturation = val;
  }

  setSharpness(val) {
    this.filters.sharpness = val;
  }

}
