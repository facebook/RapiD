import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import * as Rapid from '../../../modules/headless.js';

test('actionAddMidpoint', async t => {
  await t.test('adds the node at the midpoint location', t => {
    const node = Rapid.osmNode();
    const a = Rapid.osmNode();
    const b = Rapid.osmNode();
    const midpoint = {loc: [1, 2], edge: [a.id, b.id]};
    const graph = new Rapid.Graph([a, b]);
    const result = Rapid.actionAddMidpoint(midpoint, node)(graph);

    assert.ok(result instanceof Rapid.Graph);
    assert.deepEqual(result.entity(node.id).loc, [1, 2]);
  });

  await t.test('adds the node to a way that contains the given edge in forward order', t => {
    const node = Rapid.osmNode();
    const a = Rapid.osmNode();
    const b = Rapid.osmNode();
    const w1 = Rapid.osmWay();
    const w2 = Rapid.osmWay({nodes: [a.id, b.id]});
    const midpoint = {loc: [1, 2], edge: [a.id, b.id]};
    const graph = new Rapid.Graph([a, b, w1, w2]);
    const result = Rapid.actionAddMidpoint(midpoint, node)(graph);

    assert.ok(result instanceof Rapid.Graph);
    assert.deepEqual(result.entity(w1.id).nodes, []);
    assert.deepEqual(result.entity(w2.id).nodes, [a.id, node.id, b.id]);
  });

  await t.test('adds the node to a way that contains the given edge in reverse order', t => {
    const node = Rapid.osmNode();
    const a = Rapid.osmNode();
    const b = Rapid.osmNode();
    const w1 = Rapid.osmWay();
    const w2 = Rapid.osmWay({nodes: [b.id, a.id]});
    const midpoint = {loc: [1, 2], edge: [a.id, b.id]};
    const graph = new Rapid.Graph([a, b, w1, w2]);
    const result = Rapid.actionAddMidpoint(midpoint, node)(graph);

    assert.ok(result instanceof Rapid.Graph);
    assert.deepEqual(result.entity(w1.id).nodes, []);
    assert.deepEqual(result.entity(w2.id).nodes, [b.id, node.id, a.id]);
  });

  await t.test('turns an invalid double-back into a self-intersection', t => {
    // a====b (aba)
    // Expected result (converts to a valid loop):
    // a---b (acba)
    //  \ /
    //   c

    const a = Rapid.osmNode();
    const b = Rapid.osmNode();
    const c = Rapid.osmNode();
    const w = Rapid.osmWay({nodes: [a.id, b.id, a.id]});
    const midpoint = {loc: [1, 2], edge: [a.id, b.id]};
    const graph = new Rapid.Graph([a, b, w]);
    const result = Rapid.actionAddMidpoint(midpoint, c)(graph);

    assert.ok(result instanceof Rapid.Graph);
    assert.deepEqual(result.entity(w.id).nodes, [a.id, c.id, b.id, a.id]);
  });
});
