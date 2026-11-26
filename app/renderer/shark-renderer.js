// S18: the shark renderer (docs/DESIGN-BRIEF-1.1.md section 7). An ES module, so it can import the
// vendored Three.js 0.160.0 (app/renderer/vendor/three/, pinned by app/vendor-three.test.js).
//
// One renderer module, five calls, driven by shark-shape.js's clock:
//   setState(idle | listening | thinking | speaking), setVoiceLevel(0..1), setLook(settings),
//   setFrameRate(mode), pause() / resume().
// The geometry comes from the shape file through shark-shape.js (pure math); the swim, the glass
// edge glow, the thinking bands and the speaking glow are in the shaders. The shark shows only
// Mako's own state, never a task's, and is never red (the look's colours are the Dusk set).
//
// It publishes `window.ccSharkRenderer.create(...)` and fires `mako-shark-renderer-ready`. If WebGL
// can't start, create() throws `webgl-unavailable` and the brain tab shows that, never a blank box.

import * as THREE from './vendor/three/three.module.js';
import { EffectComposer } from './vendor/three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from './vendor/three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from './vendor/three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from './vendor/three/addons/postprocessing/OutputPass.js';

const SWIM_GLSL = `
  uniform float uTime;
  uniform float uSpeed;
  uniform float uTail;
  attribute float aS;
  varying float vS;
  // Mirrors shark-shape.js swimOffset(): stiff ahead of s 0.32, a travelling wave behind it.
  vec3 swim(vec3 p) {
    vS = aS;
    if (uSpeed <= 0.0 || aS <= 0.32) return p;
    float f = (aS - 0.32) / (1.2 - 0.32);
    float amp = 0.09 * uTail * f * f * 3.2;
    p.z += amp * sin(6.28318530718 * (0.45 * uSpeed * uTime - (aS - 0.32) / 1.6));
    return p;
  }
`;

// Glass: a thin fill plus a bright edge where the surface turns away (fresnel), a band of light
// that rolls snout to tail while thinking, and a glow that swells with Mako's voice.
const GLASS_VERT = `${SWIM_GLSL}
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    vec3 p = swim(position);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vView = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;
const GLASS_FRAG = `
  uniform vec3 uShell;
  uniform vec3 uEdge;
  uniform float uEdgeGlow;
  uniform float uFill;
  uniform float uBright;
  uniform float uBand;
  uniform float uBandOn;
  varying vec3 vNormal;
  varying vec3 vView;
  varying float vS;
  void main() {
    float fres = pow(1.0 - abs(dot(normalize(vNormal), normalize(vView))), 2.5);
    float band = uBandOn * smoothstep(0.08, 0.0, abs(vS - uBand));
    vec3 col = uShell * uFill + uEdge * uEdgeGlow * fres + uEdge * band * 0.9;
    float a = clamp(uFill + fres * 0.9 + band * 0.5, 0.0, 1.0);
    gl_FragColor = vec4(col * uBright, a);
  }
`;
const LINE_VERT = `${SWIM_GLSL}
  void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(swim(position), 1.0); }
`;
const LINE_FRAG = `
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uBright;
  uniform float uBand;
  uniform float uBandOn;
  varying float vS;
  void main() {
    float band = uBandOn * smoothstep(0.08, 0.0, abs(vS - uBand));
    gl_FragColor = vec4(uColor * uBright * (1.0 + band * 1.5), uOpacity);
  }
`;
const POINT_VERT = `${SWIM_GLSL}
  uniform float uSize;
  uniform float uPull;
  attribute vec3 aSkin;
  void main() {
    vec3 p = mix(position, aSkin, uPull);
    vec4 mv = modelViewMatrix * vec4(swim(p), 1.0);
    gl_PointSize = uSize * (6.0 / -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;
const POINT_FRAG = `
  uniform vec3 uColor;
  uniform float uBright;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    if (d > 0.5) discard;
    gl_FragColor = vec4(uColor * uBright, smoothstep(0.5, 0.0, d));
  }
`;

// Target values per state (brief 7: the four states, and no others).
const STATE_TARGETS = {
  idle: { bright: 1.0, speed: 1.0, pull: 0.0, bandOn: 0.0, flow: 1.0 },
  listening: { bright: 1.08, speed: 0.75, pull: 1.0, bandOn: 0.0, flow: 1.0 },
  thinking: { bright: 1.05, speed: 1.0, pull: 0.0, bandOn: 1.0, flow: 2.0 },
  speaking: { bright: 1.3, speed: 1.0, pull: 0.2, bandOn: 0.0, flow: 1.2 },
};

function geometry(positions, sAt, indices) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('aS', new THREE.Float32BufferAttribute(sAt, 1));
  if (indices) { g.setIndex(indices); g.computeVertexNormals(); }
  return g;
}

/**
 * Create the renderer in `host` (an element) for one checked shape.
 * deps: { host, shape (from shark-shape.js), geo (window.ccSharkShape), look, reducedMotion() }
 * Returns { draw(frame), resize(), setLook(look), dispose(), canvas }.
 */
function refusal(kind) { const e = new Error(`shark-renderer: ${kind}`); e.kind = kind; return e; }

function create(deps) {
  const d = deps || {};
  if (!d.host || !d.shape || !d.geo) throw refusal('deps-missing');
  const look = Object.assign({}, d.geo.DEFAULT_LOOK, d.look || {});
  const canvas = document.createElement('canvas');
  canvas.className = 'mk-shark-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  // Ask for the context ourselves first, so a machine without WebGL 2 is refused with one clear
  // reason (shown on the stage) instead of Three.js's own console errors.
  const ctxOptions = { alpha: true, antialias: true, powerPreference: 'high-performance' };
  let context = null;
  try { context = canvas.getContext('webgl2', ctxOptions); } catch { context = null; }
  if (!context) throw refusal('webgl-unavailable');
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer(Object.assign({ canvas, context }, ctxOptions));
  } catch {
    throw refusal('webgl-unavailable');
  }
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  // Opaque black, drawn with \`mix-blend-mode: screen\` (styles.css): black adds nothing over the
  // stage's glow, and the glass and bloom add light, so no box shows around the shark.
  renderer.setClearColor(0x000000, 1);
  d.host.appendChild(canvas);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 2, 0.1, 50);
  camera.position.set(0.6, 0.9, 7.2);
  camera.lookAt(0, 0, 0);
  const shark = new THREE.Group();
  shark.rotation.y = -0.35;
  scene.add(shark);

  const uniforms = {
    uTime: { value: 0 }, uSpeed: { value: look.speed }, uTail: { value: look.tail },
    uBright: { value: 1 }, uBand: { value: -1 }, uBandOn: { value: 0 },
  };
  const color = (hex) => new THREE.Color(hex);
  const glass = new THREE.ShaderMaterial({
    vertexShader: GLASS_VERT, fragmentShader: GLASS_FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    uniforms: Object.assign({}, uniforms, { uShell: { value: color(look.shell) }, uEdge: { value: color(look.edge) }, uEdgeGlow: { value: look.edgeGlow }, uFill: { value: look.glassFill } }),
  });
  const thread = new THREE.ShaderMaterial({
    vertexShader: LINE_VERT, fragmentShader: LINE_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: Object.assign({}, uniforms, { uColor: { value: color(look.edge) }, uOpacity: { value: 0.55 * look.threads } }),
  });
  const light = new THREE.ShaderMaterial({
    vertexShader: LINE_VERT, fragmentShader: LINE_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: Object.assign({}, uniforms, { uColor: { value: color('#e8ecff') }, uOpacity: { value: 0.9 } }),
  });
  const sparkle = new THREE.ShaderMaterial({
    vertexShader: POINT_VERT, fragmentShader: POINT_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: Object.assign({}, uniforms, { uColor: { value: color('#cfe0ff') }, uSize: { value: 5 }, uPull: { value: 0 } }),
  });
  const coreMat = new THREE.ShaderMaterial({
    vertexShader: POINT_VERT, fragmentShader: POINT_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: Object.assign({}, uniforms, { uColor: { value: color(look.hot) }, uSize: { value: 26 * look.core }, uPull: { value: 0 } }),
  });
  // Every material shares the same uniform objects for time, speed, tail, brightness and bands.
  const materials = [glass, thread, light, sparkle, coreMat];
  for (const m of materials) for (const k of Object.keys(uniforms)) m.uniforms[k] = uniforms[k];

  const geo = d.geo;
  const body = geo.bodyMesh(d.shape, 64, 32);
  shark.add(new THREE.Mesh(geometry(body.positions, body.sAt, body.indices), glass));
  for (const fin of geo.finMeshes(d.shape)) {
    shark.add(new THREE.Mesh(geometry(fin.positions, fin.sAt, fin.indices), glass));
  }
  // Inner threads (veins) along the body at a few angles, slightly inside the skin.
  const tPos = [], tS = [];
  const angles = [0.4, 1.2, 2.0, 2.8, 3.6, 4.4, 5.2, 6.0].slice(0, Math.max(2, Math.round(8 * look.veins + 2)));
  for (const th of angles) {
    for (let i = 0; i < 60; i++) {
      const s0 = 0.04 + (i / 60) * 0.94, s1 = 0.04 + ((i + 1) / 60) * 0.94;
      tPos.push(...geo.bodyPoint(d.shape, s0, th, 1, 0.82), ...geo.bodyPoint(d.shape, s1, th, 1, 0.82));
      tS.push(s0, s1);
    }
  }
  shark.add(new THREE.LineSegments(geometry(tPos, tS), thread));
  // The mouth is a line of light, the teeth short strokes, the gills five arcs, the eye a point.
  const m = d.shape.mouth, lPos = [], lS = [];
  const mouthTh = -Math.PI / 2 + 0.35;
  for (const side of [1, -1]) {
    lPos.push(...geo.bodyPoint(d.shape, m.front, mouthTh, side, 1.01), ...geo.bodyPoint(d.shape, m.corner, mouthTh + 0.25 * m.spread, side, 1.01));
    lS.push(m.front, m.corner);
    for (let k = 1; k < 6; k++) {
      const s = m.front + ((m.corner - m.front) * k) / 6;
      const a = geo.bodyPoint(d.shape, s, mouthTh + 0.05 * k * m.spread, side, 1.01);
      lPos.push(...a, a[0], a[1] - 0.03, a[2]);
      lS.push(s, s);
    }
    for (const s of d.shape.gills.s) {
      lPos.push(...geo.bodyPoint(d.shape, s, d.shape.gills.th[0], side, 1.01), ...geo.bodyPoint(d.shape, s + 0.01, d.shape.gills.th[1], side, 1.01));
      lS.push(s, s);
    }
  }
  shark.add(new THREE.LineSegments(geometry(lPos, lS), light));
  // Sparkles: points just off the skin that draw in to it while listening.
  const count = Math.round(400 * look.sparkles);
  const sp = [], skin = [], spS = [];
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < count; i++) {
    const s = 0.03 + rnd() * 0.95, th = rnd() * Math.PI * 2, side = rnd() < 0.5 ? 1 : -1;
    sp.push(...geo.bodyPoint(d.shape, s, th, side, 1.18 + rnd() * 0.2));
    skin.push(...geo.bodyPoint(d.shape, s, th, side, 1.0));
    spS.push(s);
  }
  const spGeo = geometry(sp, spS);
  spGeo.setAttribute('aSkin', new THREE.Float32BufferAttribute(skin, 3));
  shark.add(new THREE.Points(spGeo, sparkle));
  // The warm core, inside the body behind the gills.
  const core = geo.bodyPoint(d.shape, 0.36, 0, 1, 0);
  const coreGeo = geometry(core, [0.36]);
  coreGeo.setAttribute('aSkin', new THREE.Float32BufferAttribute(core, 3));
  shark.add(new THREE.Points(coreGeo, coreMat));
  const eye = geo.bodyPoint(d.shape, d.shape.eye.s, d.shape.eye.th, 1, 1.02);
  const eyeGeo = geometry(eye, [d.shape.eye.s]);
  eyeGeo.setAttribute('aSkin', new THREE.Float32BufferAttribute(eye, 3));
  const eyeMat = sparkle.clone();
  for (const k of Object.keys(uniforms)) eyeMat.uniforms[k] = uniforms[k];
  eyeMat.uniforms.uSize = { value: 9 * look.eye };
  eyeMat.uniforms.uPull = { value: 0 };
  eyeMat.uniforms.uColor = { value: color('#ffffff') };
  materials.push(eyeMat);
  shark.add(new THREE.Points(eyeGeo, eyeMat));

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), look.bloom, 0.6, 0.0);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  const current = Object.assign({}, STATE_TARGETS.idle);
  function resize() {
    const w = Math.max(1, d.host.clientWidth | 0), h = Math.max(1, d.host.clientHeight | 0);
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  resize();

  // One frame from shark-shape.js's clock: { state, t (ms), dt, voice, motion }.
  function draw(frame) {
    const f = frame || {};
    const target = STATE_TARGETS[f.state] || STATE_TARGETS.idle;
    const k = f.motion ? Math.min(1, (f.dt || 0) / 250) : 1;
    for (const key of Object.keys(current)) current[key] += (target[key] - current[key]) * k;
    const t = (f.t || 0) / 1000;
    uniforms.uTime.value = t;
    uniforms.uSpeed.value = f.motion ? look.speed * current.speed : 0;
    uniforms.uTail.value = look.tail;
    uniforms.uBright.value = current.bright * (f.state === 'speaking' ? 1 + 0.6 * (f.voice || 0) : 1);
    uniforms.uBandOn.value = current.bandOn;
    uniforms.uBand.value = f.motion ? (t % 1) * 1.2 - 0.1 : 0.4; // about once a second, snout to tail
    sparkle.uniforms.uPull.value = current.pull;
    coreMat.uniforms.uSize.value = 26 * look.core * (1 + (f.motion ? 0.12 * Math.sin(t * 2 * Math.PI * 0.5 * current.flow * look.flow) : 0));
    // Cruise: a slow, gentle drift in place (no motion under reduced motion).
    shark.position.y = f.motion ? 0.06 * Math.sin(t * 0.5) : 0;
    shark.rotation.y = -0.35 + (f.motion ? 0.05 * Math.sin(t * 0.3) : 0);
    composer.render();
  }

  function setLook(next) {
    Object.assign(look, next || {});
    glass.uniforms.uShell.value = color(look.shell);
    glass.uniforms.uEdge.value = color(look.edge);
    glass.uniforms.uEdgeGlow.value = look.edgeGlow;
    glass.uniforms.uFill.value = look.glassFill;
    thread.uniforms.uColor.value = color(look.edge);
    coreMat.uniforms.uColor.value = color(look.hot);
    bloom.strength = look.bloom;
  }

  function dispose() {
    scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    for (const mat of materials) mat.dispose();
    composer.dispose && composer.dispose();
    renderer.dispose();
    canvas.remove();
  }

  return { draw, resize, setLook, dispose, canvas };
}

window.ccSharkRenderer = Object.freeze({ create, STATES: Object.freeze(Object.keys(STATE_TARGETS)) });
window.dispatchEvent(new Event('mako-shark-renderer-ready'));
