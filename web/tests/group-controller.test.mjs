import test from 'node:test';
import assert from 'node:assert/strict';
import {compileController} from '../src/controller/compiler.js';
import {compileMetrics} from '../src/metrics/compiler.js';
import {validateProfileController} from '../src/runtime/profiles.js';
test('group filtering stays within local observations and compiles numeric predicates',()=>{
 const ir=compileController(`class GroupAgent(Agent):
    def step(self, obs):
        total = 0.0
        for n in obs.neighbours:
            total += eq(n.group, obs.group) * eq(n.kind, 0.0) * le(norm(n.relative_position), 3.5)
        return Motion(min(total, 0.15), max(-1.0, 0.0))`);
 assert.equal(ir.body.at(-1).kind,'return');
 assert.throws(()=>validateProfileController(null,ir,null),/RUNTIME_PROFILE/);
 assert.doesNotThrow(()=>validateProfileController({},ir,null));
 assert.throws(()=>compileController(`class A(Agent):
    def step(self, obs):
        return Motion(obs.position, 0.0)`),/observation/);
});
test('metrics can explicitly select active members and preserve resolved outcome records',()=>{
 const ir=compileMetrics(`@metric(id="count", name="Active count", unit=None, sampling=every(0.1))
def count(snapshot):
    result = 0.0
    for a in snapshot.agents:
        result += a.active
    return result`);
 assert.equal(ir.metrics.length,1);
 assert.throws(()=>validateProfileController(null,null,ir),/RUNTIME_PROFILE/);
});
