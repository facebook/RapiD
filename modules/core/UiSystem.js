import { select } from 'd3-selection';
import { vecAdd } from '@rapid-sdk/math';

import { AbstractSystem } from './AbstractSystem.js';
import { utilDetect } from '../util/detect.js';

import {
  UiApiStatus, UiDefs, uiEditMenu, uiFlash, UiFullscreen, uiIntro,
  uiLoading, UiMapFooter, UiMapToolbar, uiMapRouletteMenu, UiOvermap,
  uiSplash, uiRestore, UiShortcuts, UiSidebar, uiWhatsNew
} from '../ui/index.js';


/**
 * `UiSystem` maintains the user interface.
 *
 * Events available:
 *   `uichange`  Fires on any change in the ui (such as resize)
 */
export class UiSystem extends AbstractSystem {

  /**
   * @constructor
   * @param  `context`   Global shared application context
   */
  constructor(context) {
    super(context);
    this.id = 'ui';
    this.dependencies = new Set(['assets', 'editor', 'gfx', 'imagery', 'l10n', 'map', 'storage', 'urlhash']);

    this._mapRect = null;
    this._needWidth = {};
    this._initPromise = null;
    this._startPromise = null;
    this._resizeTimeout = null;

    // Child components, we will defer creating these until after some other things have initted.
    this.ApiStatus = null;
    this.AuthModal = null;
    this.Defs = null;
    this.EditMenu = null;
    this.MapRouletteMenu = null;
    this.Flash = null;
    this.Fullscreen = null;
    this.MapFooter = null;
    this.MapToolbar = null;
    this.Overmap = null;
    this.Shortcuts = null;
    this.Sidebar = null;

    // These components live below in the tree, but we will hold a reference
    // to them here in the UiSystem, so other code can find them easily.
    this.InfoCards = null;
    this.Minimap = null;
    this.PhotoViewer = null;
    this.Spector = null;

    // Ensure methods used as callbacks always have `this` bound correctly.
    // (This is also necessary when using `d3-selection.call`)
    this.render = this.render.bind(this);
    this.resize = this.resize.bind(this);
  }


  /**
   * initAsync
   * Called after all core objects have been constructed.
   * @return {Promise} Promise resolved when this component has completed initialization
   */
  initAsync() {
    if (this._initPromise) return this._initPromise;

    for (const id of this.dependencies) {
      if (!this.context.systems[id]) {
        return Promise.reject(`Cannot init:  ${this.id} requires ${id}`);
      }
    }

    const context = this.context;
    const assets = context.systems.assets;
    const gfx = context.systems.gfx;
    const l10n = context.systems.l10n;
    const urlhash = context.systems.urlhash;

    // Many UI components require l10n and gfx (for scene/layers)
    const prerequisites = Promise.all([
      assets.initAsync(),
      l10n.initAsync(),
      gfx.initAsync(),
      urlhash.initAsync(),
    ]);

    return this._initPromise = prerequisites
      .then(() => {
        window.addEventListener('resize', this.resize);

        this._checkEnvironment();  // are we in a dev or staging environment?

        // Create UI components
        this.ApiStatus = new UiApiStatus(context);
        this.AuthModal = uiLoading(context).blocking(true).message(l10n.t('loading_auth'));
        this.Defs = new UiDefs(context);
        this.EditMenu = uiEditMenu(context);
        this.MapRouletteMenu = uiMapRouletteMenu(context);
        this.Flash = uiFlash(context);
        this.Fullscreen = new UiFullscreen(context);
        this.MapFooter = new UiMapFooter(context);
        this.MapToolbar = new UiMapToolbar(context);
        this.Overmap = new UiOvermap(context);
        this.Shortcuts = new UiShortcuts(context);
        this.Sidebar = new UiSidebar(context);

        // These components live below in the tree, but we will hold a reference
        // to them here in the UiSystem, so that other code can find them easily.
        this.InfoCards = this.Overmap.InfoCards;
        this.Minimap = this.Overmap.Minimap;
        this.PhotoViewer = this.Overmap.PhotoViewer;
        this.Spector = this.Overmap.Spector;

        // Setup Event listeners..
        l10n.on('localechange', () => {
          if (this._started) {
            this.render();
          }
        });

        const osm = context.services.osm;
        if (osm) {
          osm
            .on('authLoading', () => context.container()?.call(this.AuthModal))
            .on('authDone', () => this.AuthModal.close());
        }
      });

// not sure what these were for
//    $container.on('click.ui', d3_event => {
//      if (d3_event.button !== 0) return;  // we're only concerned with the primary mouse button
//      if (!d3_event.composedPath) return;
//
//      // some targets have default click events we don't want to override
//      const isOkayTarget = d3_event.composedPath().some(node => {
//        return node.nodeType === 1 && (  // we only care about element nodes
//          node.nodeName === 'INPUT' ||   // clicking <input> focuses it and/or changes a value
//          node.nodeName === 'LABEL' ||   // clicking <label> affects its <input> by default
//          node.nodeName === 'A');        // clicking <a> opens a hyperlink by default
//       });
//      if (isOkayTarget) return;
//
//      d3_event.preventDefault();   // disable double-tap-to-zoom on touchscreens
//    });
//
//    // only WebKit supports gesture events
//    // Listening for gesture events on iOS 13.4+ breaks double-tapping,
//    // but we only need to do this on desktop Safari anyway. – #7694
//    if ('GestureEvent' in window && !detected.isMobileWebKit) {
//      // On iOS we disable pinch-to-zoom of the UI via the `touch-action`
//      // CSS property, but on desktop Safari we need to manually cancel the
//      // default gesture events.
//      $container.on('gesturestart.ui gesturechange.ui gestureend.ui', d3_event => {
//        // disable pinch-to-zoom of the UI via multitouch trackpads on macOS Safari
//        d3_event.preventDefault();
//      });
//    }

  }


  /**
   * startAsync
   * Called after all core objects have been initialized.
   * @return {Promise} Promise resolved when this component has completed startup
   */
  startAsync() {
    if (this._startPromise) return this._startPromise;

    const context = this.context;
    const editor = context.systems.editor;
    const map = context.systems.map;
    const storage = context.systems.storage;
    const urlhash = context.systems.urlhash;
    const $container = context.container();

    if (!$container.size()) {
      return Promise.reject(new Error('No container to render to.'));
    }

    // These systems currently don't do anything in start,
    // but if they did, we'd want them to settle first.
    const prerequisites = Promise.all([
      editor.startAsync(),
      map.startAsync()
    ]);

    return this._startPromise = prerequisites
      .then(() => {
        this.render();  // Render one time
        this.resize();  // Update map dimensions - this should happen after .main-content and toolbars exist.

        context.enter('browse');

        // What to show first?
        const startWalkthrough = urlhash.initialHashParams.get('walkthrough') === 'true';
        const sawPrivacyVersion = parseInt(storage.getItem('sawPrivacyVersion'), 10) || 0;
        const sawWhatsNewVersion = parseInt(storage.getItem('sawWhatsNewVersion'), 10) || 0;

        if (startWalkthrough) {
          $container.call(uiIntro(context));     // Jump right into walkthrough..
        } else if (editor.canRestoreBackup) {
          $container.call(uiRestore(context));   // Offer to restore backup edits..
        } else if (sawPrivacyVersion !== context.privacyVersion) {
          $container.call(uiSplash(context));    // Show "Welcome to Rapid" / Privacy Policy
        } else if (sawWhatsNewVersion !== context.whatsNewVersion) {
          $container.call(uiWhatsNew(context));  // Show "Whats New"
        }

        this._started = true;
      });
  }


  /**
   * resetAsync
   * Called after completing an edit session to reset any internal state
   * @return {Promise} Promise resolved when this component has completed resetting
   */
  resetAsync() {
    // don't leave stale state in the inspector
    const $container = this.context.container();
    if ($container.size()) {
      $container.select('.inspector-wrap *').remove();
    }

    return Promise.resolve();
  }


  /**
   * render
   * Renders the Rapid user interface into the main container.
   * Note that most `render` functions accept a parent selection,
   *  this one doesn't need it - `$container` is always the parent.
   */
  render() {
    const context = this.context;
    const l10n = context.systems.l10n;
    const map = context.systems.map;
    const $container = context.container();

    $container
      .attr('lang', l10n.localeCode())
      .attr('dir', l10n.textDirection())
      .call(this.Fullscreen.render)
      .call(this.Defs.render)
      .call(this.Sidebar.render);

    // .main-content
    // Contains the map and everything floating above it, such as toolbars, etc.
    let $mainContent = $container.selectAll('.main-content')
      .data([0]);

    // enter
    const $$mainContent = $mainContent.enter()
      .append('div')
      .attr('class', 'main-content active');

    // update
    $mainContent = $mainContent.merge($$mainContent);

    $mainContent
      .call(map.render)
      .call(this.MapToolbar.render)
      .call(this.Overmap.render)
      .call(this.ApiStatus.render)
      .call(this.MapFooter.render);
  }


  /*
   * resize
   * Handler for resize events on the window.
   * Note that this can just be called with no event to recheck the dimensions.
   * @param {Event}  e? - the resize event (if any)
   */
  resize(e) {
    const context = this.context;
    const map = context.systems.map;
    const viewport = context.viewport;
    const $container = context.container();

    // This is an actual resize event - class the container as resizing.
    if (e) {
      window.clearTimeout(this._resizeTimeout);
      $container.classed('resizing', true);
      this._resizeTimeout = window.setTimeout(() => {
        $container.classed('resizing', false);
      }, 400);  // if no resizes for 400ms, remove class
    }

    const $mainContent = $container.selectAll('.main-content');
    if (!$mainContent.size()) return;  // called too early?

    const curr = this._copyRect($mainContent.node().getBoundingClientRect());
    const prev = this._mapRect || curr;
    this._mapRect = curr;

    // Determine how the map is getting resized
    // (we do prev-curr because we want negative values to pan with)
    const dtop = prev.top - curr.top;
    const dright = prev.right - curr.right;
    const dbottom = prev.bottom - curr.bottom;
    const dleft = prev.left - curr.left;

    // Un-pan map to keep it centered in the same spot.
    // (div/2 because the map grows/shrinks from the middle, so we only need to pan half this distance)
    const [dw, dh] = [dleft + dright, dtop + dbottom];
    if (dw || dh) {
      map.pan([dw / 2, dh / 2]);
    }

    let dims = [curr.width, curr.height];

// experiment:
// Previously, the map surfaces were anchored to the top left of the main-map.
// Now, the map surfaces are centered in a CSS Grid, to support rotation around the center.
// We can extend the map dimensions a little bit so that as the user pans, we dont see seams at the edges of the map.
const overscan = 50;
dims = vecAdd(dims, [overscan * 2, overscan * 2]);

    viewport.dimensions = dims;

    // check if header or footer have overflowed
    this.checkOverflow('.map-toolbar');
    this.checkOverflow('.map-footer');

    this.emit('uichange');

// this was for the restrictions editor?
// or any other component that needs to know when resizing is happening
//    // Use outdated code so it works on Explorer
//    const resizeWindowEvent = document.createEvent('Event');
//    resizeWindowEvent.initEvent('resizeWindow', true, true);
//    document.dispatchEvent(resizeWindowEvent);
  }


  /**
   * checkOverflow
   * Call checkOverflow when resizing or whenever the contents change.
   * I think this was to make button labels in the top bar disappear
   * when more buttons are added than the screen has available width
   * @param  {string}   selector - selector to select the thing to check
   */
  checkOverflow(selector, reset) {
    if (reset) {
      delete this._needWidth[selector];
    }

    const $selection = this.context.container().select(selector);
    if ($selection.empty()) return;

    const scrollWidth = $selection.property('scrollWidth');
    const clientWidth = $selection.property('clientWidth');
    let needed = this._needWidth[selector] || scrollWidth;

    if (scrollWidth > clientWidth) {    // overflow happening
      $selection.classed('narrow', true);
      if (!this._needWidth[selector]) {
        this._needWidth[selector] = scrollWidth;
      }

    } else if (scrollWidth >= needed) {
      $selection.classed('narrow', false);
    }
  }


  /**
   * togglePanes
   * If no `$showpane` is passed, all panes are hidden.
   * @param {d3-selection} $showpane? - A d3-selection to the pane to show
   */
  togglePanes($showpane) {
    const context = this.context;
    const l10n = context.systems.l10n;
    const container = context.container();

    const $hidepanes = container.selectAll('.map-pane.shown');
    const side = l10n.isRTL() ? 'left' : 'right';

    $hidepanes
      .classed('shown', false)
      .classed('hide', true);

    container.selectAll('.map-pane-control button')
      .classed('active', false);

    if ($showpane) {
      $hidepanes
        .classed('shown', false)
        .classed('hide', true)
        .style(side, '-500px');

      container.selectAll('.' + $showpane.attr('pane') + '-control button')
        .classed('active', true);

      $showpane
        .classed('shown', true)
        .classed('hide', false);

      if ($hidepanes.empty()) {
        $showpane
          .style(side, '-500px')
          .transition()
          .duration(200)
          .style(side, '0px');
      } else {
        $showpane
          .style(side, '0px');
      }

    } else {
      $hidepanes
        .classed('shown', true)
        .classed('hide', false)
        .style(side, '0px')
        .transition()
        .duration(200)
        .style(side, '-500px')
        .on('end', function() {
          select(this)
            .classed('shown', false)
            .classed('hide', true);
        });
    }
  }


  /*
   * showEditMenu
   * This shows the contextual edit menu, called by the select behavior when the
   *  user right clicks, or long presses, or presses the menu key.
   * @param  {Array}   anchorPoint  - `[x,y]` screen coordinate where the menu should be anchored
   * @param  {string}  triggerType  - (not used?)  'touch', 'pen', or 'rightclick' that triggered the menu
   */
  showEditMenu(anchorPoint, triggerType) {
    this.EditMenu.close();   // remove any displayed menu

    const context = this.context;
    const gfx = context.systems.gfx;
    const viewport = context.viewport;

    // The mode decides which operations are available
    const operations = context.mode?.operations ?? [];
    if (!operations.length) return;
    if (!context.editable()) return;

    // Focus the surface, otherwise clicking off the menu may not trigger browse mode
    // (bhousel - I don't know whether this is needed anymore in 2024)
    const surface = gfx.surface;
    if (surface.focus) {   // FF doesn't support it
      surface.focus();
    }

    for (const operation of operations) {
      if (typeof operation.point === 'function') {
        operation.point(anchorPoint);  // let the operation know where the menu is
      }
    }

    this.EditMenu
      .anchorLoc(viewport.unproject(anchorPoint))
      .triggerType(triggerType)
      .operations(operations);

    // render the menu
    const $overlay = select(gfx.overlay);
    $overlay.call(this.EditMenu);
  }


  /*
   * redrawEditMenu
   * This just redraws the edit menu in place if it is already showing, used in
   * situations where its available operations may have changed, such as Rapid#1311
   */
  redrawEditMenu() {
    const context = this.context;
    const gfx = context.systems.gfx;
    const $overlay = select(gfx.overlay);

    // If the menu isn't showing, there's nothing to do
    if ($overlay.selectAll('.edit-menu').empty()) return;

    // The mode decides which operations are available
    const operations = context.mode?.operations ?? [];

    if (operations.length && context.editable()) {
      this.EditMenu.operations(operations);
      $overlay.call(this.EditMenu);   // redraw it
    } else {
      this.EditMenu.close();
    }
  }


  /*
   * closeEditMenu
   * Remove any existing menu
   */
  closeEditMenu() {
    this.EditMenu.close();
  }


  // Method to show the MapRoulette context menu
  showMapRouletteMenu(anchorPoint, triggerType) {
    this.closeMapRouletteMenu(); // Close any existing menu
    const context = this.context;
    const gfx = context.systems.gfx;
    const viewport = context.viewport;
    this.MapRouletteMenu
      .anchorLoc(viewport.unproject(anchorPoint))
      .triggerType(triggerType);
    const $overlay = select(gfx.overlay);
    $overlay.call(this.MapRouletteMenu);
    this._showsMapRouletteMenu = true; // Update state
  }


  /*
   * closeMapRouletteMenu
   * Remove any existing menu
   */
  closeMapRouletteMenu() {
    this.MapRouletteMenu.close();
  }


  /**
   * _checkEnvironment
   * This adjusts the favicon and document title if we detect a development or staging environment.
   * called by `initAsync()`
   */
  _checkEnvironment() {
    const context = this.context;
    const assets = context.systems.assets;
    const urlhash = context.systems.urlhash;
    const detected = utilDetect();

    const $head = select('head');
    let $favicon = $head.select(`link[rel~='icon']`);
    if (!$favicon.size()) {
      $favicon = $head
        .append('link')
        .attr('rel', 'icon')
        .attr('type', 'image/svg');
    }

    if (/\/canary/.test(detected.host)) {
      urlhash.titleBase = 'Rapid Canary';
      $favicon.attr('href', assets.getFileURL('img/rapid_favicon-canary.svg'));

    } else if (/(localhost|127\.0\.0\.1)/.test(detected.host)) {
      urlhash.titleBase = 'Rapid Dev';
      $favicon.attr('href', assets.getFileURL('img/rapid_favicon-dev.svg'));
    }
  }


  /**
   * _copyRect
   * ClientRects are immutable, so copy them to an Object in case we need to trim the height/width.
   * @param   {DOMRect}  src -  rectangle (or something that looks like one)
   * @returns {Object}   the copied properties
   */
  _copyRect(src) {
    return {
      left: src.left,
      top: src.top,
      right: src.right,
      bottom: src.bottom,
      width: src.width,
      height: src.height,
      x: src.x,
      y: src.y
    };
  }

}
