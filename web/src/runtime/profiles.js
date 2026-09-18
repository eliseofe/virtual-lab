// Opt-in, versioned simulator-owned configuration; no experiment equations here.
export const PROFILE_SCHEMA = 'vlab.runtime-profile/1';
const number = (v, name, min = -Infinity, max = Infinity) => {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) throw Error(`${name} must be finite in [${min}, ${max}]`);
  return v;
};
const integer = (v, name, min = 0, max = 10000) => {
  number(v,name,min,max); if (!Number.isInteger(v)) throw Error(`${name} must be an integer`); return v;
};
const vector = (v,n,name) => {
  if (!Array.isArray(v) || v.length!==n) throw Error(`${name} requires ${n} components`);
  return v.map(x=>number(x,name));
};
export function parseRuntimeProfile(values) {
  if (values.RUNTIME_PROFILE === undefined) return null;
  let input;
  try { input=JSON.parse(values.RUNTIME_PROFILE); } catch { throw Error('RUNTIME_PROFILE must contain valid JSON'); }
  const resolve=v=>typeof v==='string'&&v.startsWith('$') ? values[v.slice(1)] : Array.isArray(v) ? v.map(resolve) : v&&typeof v==='object' ? Object.fromEntries(Object.entries(v).map(([k,x])=>[k,resolve(x)])) : v;
  const p=resolve(input);
  if (p.schema!==PROFILE_SCHEMA) throw Error('Unsupported runtime profile schema');
  if (!['unicycle','quadrotor'].includes(p.backend)) throw Error('Unknown physics backend');
  if (!Array.isArray(p.profiles)||!p.profiles.length) throw Error('Agent profiles are required');
  const ids=new Set(); let count=0;
  for (const a of p.profiles) {
    integer(a.group,'group'); if (ids.has(a.group)) throw Error('Duplicate profile group'); ids.add(a.group);
    integer(a.count,'profile count',1,512);count+=a.count;
    if (typeof a.label!=='string'||!a.label.trim()) throw Error('Profile label is required');
    number(a.radius,'observation radius',1e-9);
    number(a.maxSpeed,'speed limit',1e-9);number(a.maxTurn,'turn limit',1e-9);
    a.minSpeed??=0;number(a.minSpeed,'minimum speed',-a.maxSpeed,a.maxSpeed);
    a.altitude??=0;number(a.altitude,'altitude',0);
  }
  if (count!==values.N || count>512) throw Error('Profile counts must sum to N (maximum 512)');
  p.physicsDt??=p.backend==='quadrotor'?1/240:0.05;
  number(p.physicsDt,'physicsDt',1e-6,1);
  p.motionNoise??=0;number(p.motionNoise,'motionNoise',0);
  p.topology??='unbounded';if(!['unbounded','bounded'].includes(p.topology))throw Error('Profile topology must be unbounded or bounded');
  p.rules??=[];if(!Array.isArray(p.rules))throw Error('rules must be an array');
  for(const rule of p.rules){
    if(!['proximity','region'].includes(rule.type))throw Error('Unknown lifecycle rule');
    if(!ids.has(rule.targetGroup))throw Error('Unknown target group');
    if(rule.type==='proximity'&&(!ids.has(rule.sourceGroup)||rule.sourceGroup===rule.targetGroup))throw Error('Proximity rules require distinct known groups');
    number(rule.distance,'event distance',0);integer(rule.status,'event status',-1000,1000);if(rule.status===0)throw Error('Resolved event status must be nonzero');
    if(rule.type==='region')rule.center=vector(rule.center,2,'region centre');
    rule.metric??='xy';if(!['xy','xyz'].includes(rule.metric))throw Error('Unknown distance metric');
  }
  p.landmarks??=[];if(!Array.isArray(p.landmarks))throw Error('landmarks must be an array');
  for(const b of p.landmarks){b.position=vector(b.position,2,'landmark position');if(!ids.has(b.group))throw Error('Unknown landmark group');number(b.radius,'landmark radius',1e-9);}
  if(p.gate){
    const g=p.gate;if(!ids.has(g.observedGroup)||!ids.has(g.heldGroup))throw Error('Unknown gate group');
    g.origin=vector(g.origin,2,'gate origin');g.direction=vector(g.direction,2,'gate direction');
    const n=Math.hypot(...g.direction);if(n<1e-12)throw Error('Gate direction must be nonzero');g.direction=g.direction.map(x=>x/n);number(g.threshold,'gate threshold');
  }
  if(p.terminalGroup!==undefined&&!ids.has(p.terminalGroup))throw Error('Unknown terminal group');
  if(p.topology==='bounded'||p.backend==='quadrotor'){
    p.bounds=vector(p.bounds,3,'bounds');if(p.bounds.some(v=>v<=0))throw Error('Bounds must be positive');
  }
  if(p.backend==='quadrotor'){
    if(p.topology!=='bounded')throw Error('Quadrotor backend requires bounded geometry');
    p.flightDt??=1/120;number(p.flightDt,'flightDt',p.physicsDt,1);
    if(p.motionNoise!==0)throw Error('Quadrotor physics does not support Cartesian kinematic noise');
    for(const a of p.profiles)if(a.altitude<=0||a.altitude>=p.bounds[2])throw Error('Flight altitude must be inside the arena');
  }
  for(const [key,t] of [['CONTROL_DT',values.CONTROL_DT],['METRIC_DT',.1],['flightDt',p.flightDt??p.physicsDt]]){
    const q=t/p.physicsDt;if(!Number.isFinite(q)||Math.round(q)<1||Math.abs(q-Math.round(q))>1e-8)throw Error(`${key} must be an integer multiple of physicsDt`);
  }
  return p;
}
export function validateProfileController(profile,controller,metrics){
  const text=JSON.stringify([controller,metrics]);
  if(!profile && /"(?:obs\.group|[^".]+\.(?:group|kind|active|status|speed|altitude))"/.test(text))throw Error('Group/lifecycle observations require an explicit RUNTIME_PROFILE');
}
