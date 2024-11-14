import { selection } from 'd3-selection';

import { UiBackgroundCard } from './cards/UiBackgroundCard.js';
import { UiHistoryCard } from './cards/UiHistoryCard.js';
import { UiLocationCard } from './cards/UiLocationCard.js';
import { UiMeasurementCard } from './cards/UiMeasurementCard.js';
import { utilCmd } from '../util/cmd.js';


/**
 * UiInfoCards
 * This component acts as the container for the information cards.
 * "Cards" are user interface elements that can float on top of the map
 * and provide extra information about the map or the selection.
 */
export class UiInfoCards {

  /**
   * @constructor
   * @param  `context`  Global shared application context
   */
  constructor(context) {
    this.context = context;

    this._wasVisible = new Set();

    // Create child components
    this.BackgroundCard = new UiBackgroundCard(context);
    this.HistoryCard = new UiHistoryCard(context);
    this.LocationCard = new UiLocationCard(context);
    this.MeasurementCard = new UiMeasurementCard(context);

    // Info Cards
    this.cards = [
      this.BackgroundCard,
      this.HistoryCard,
      this.LocationCard,
      this.MeasurementCard
    ];

    // D3 selections
    this.$parent = null;

    // Ensure methods used as callbacks always have `this` bound correctly.
    // (This is also necessary when using `d3-selection.call`)
    this.render = this.render.bind(this);
    this.toggle = this.toggle.bind(this);

    // bind ⌘I to show/hide all cards
    const l10n = context.systems.l10n;
    this.key = utilCmd('⌘' + l10n.t('info_panels.key'));
    context.keybinding().on(this.key, this.toggle);
  }


  /**
   * render
   * Accepts a parent selection, and renders the content under it.
   * (The parent selection is required the first time, but can be inferred on subsequent renders)
   * @param {d3-selection} $parent - A d3-selection to a HTMLElement that this component should render itself into
   */
  render($parent = this.$parent) {
    if ($parent instanceof selection) {
      this.$parent = $parent;
    } else {
      return;   // no parent - called too early?
    }

    // .info-cards container
    let $wrap = $parent.selectAll('.info-cards')
      .data([0]);

    const $$wrap = $wrap.enter()
      .append('div')
      .attr('class', 'info-cards');

    $wrap = $wrap.merge($$wrap);

    for (const Card of this.cards) {
      $wrap.call(Card.render);
    }
  }


  /**
   * toggle
   * Toggles all info cards on/off
   * @param  {Event} e - event that triggered the toggle (if any)
   */
  toggle(e) {
    if (e) e.preventDefault();

    // Which cards are currently visible?
    const currVisible = new Set();
    for (const Card of this.cards) {
      if (Card.visible) {
        currVisible.add(Card);
      }
    }

    // Some cards are shown - toggle them off
    if (currVisible.size) {
      this._wasVisible = currVisible;
      for (const Card of currVisible) {
        Card.hide(e);
      }

    // No cards are shown - toggle them on
    } else {
      if (!this._wasVisible.size) {
        this._wasVisible.add(this.MeasurementCard);  // at least 1 should be visible
      }
      for (const Card of this._wasVisible) {
        Card.show(e);
      }
    }

    this.render();
  }

}