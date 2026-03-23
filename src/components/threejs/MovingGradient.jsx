import * as THREE from 'three'
import { shaderMaterial } from '@react-three/drei'
import { extend, useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import { useControls } from 'leva'

// ─── Frequency/phase tables (irrational ratios → never-repeating paths) ───
const WARM_FREQS = [
  [0.37, 0.19, 0.29, 0.11, 0.00, 1.10],
  [0.23, 0.41, 0.17, 0.31, 2.30, 0.70],
  [0.51, 0.13, 0.43, 0.22, 4.70, 3.20],
  [0.31, 0.53, 0.47, 0.16, 1.80, 5.40],
  [0.44, 0.27, 0.38, 0.52, 3.60, 2.10],
]
const COLD_FREQS = [
  [0.28, 0.44, 0.35, 0.18, 1.50, 5.10],
  [0.19, 0.33, 0.52, 0.27, 6.20, 2.40],
  [0.41, 0.22, 0.26, 0.48, 4.10, 0.90],
  [0.35, 0.57, 0.44, 0.21, 2.70, 3.80],
]

const MAX_WARM = 5
const MAX_COLD = 4
const warmKeys = Array.from({ length: MAX_WARM }, (_, i) => `uW${i}`)
const coldKeys = Array.from({ length: MAX_COLD }, (_, i) => `uC${i}`)

function lissajous(t, fx1, fx2, fy1, fy2, px, py, randomness, margin = 0.08) {
  const range = 0.5 - margin
  const amp1  = 0.55 + randomness * 0.45
  const amp2  = 0.15 + randomness * 0.30
  const x = 0.5 + Math.sin(t * fx1 + px) * range * amp1 + Math.sin(t * fx2 * (1 + randomness * 0.8)) * range * amp2
  const y = 0.5 + Math.cos(t * fy1 + py) * range * amp1 + Math.cos(t * fy2 * (1 + randomness * 0.8)) * range * amp2
  return [x, y]
}

// ─── Shaders ───
const fragmentShader = /* glsl */`
precision highp float;

uniform float uTime;
uniform vec2  uResolution;
uniform vec2  uMouse;
uniform float uSpread;
uniform float uMouseBlend;
uniform float uColdStrength;
uniform float uPeakCap;

uniform float uGrain;
uniform float uGrainSize;
uniform float uGrainSpeed;
uniform float uDPR;

uniform vec3  uC0col;
uniform vec3  uC1col;
uniform vec3  uC2col;
uniform vec3  uC3col;
uniform vec3  uC4col;

uniform vec2  uW0;
uniform vec2  uW1;
uniform vec2  uW2;
uniform vec2  uW3;
uniform vec2  uW4;

uniform vec2  uC0;
uniform vec2  uC1;
uniform vec2  uC2;
uniform vec2  uC3;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i + vec2(0,0)), hash(i + vec2(1,0)), f.x),
    mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), f.x),
    f.y
  );
}

float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += noise(p) * a;
    p  = p * 2.07 + vec2(1.3, 0.9);
    a *= 0.50;
  }
  return v;
}

// r/(d²+r) metaball — parked blobs at (-99,-99) contribute ~0
float metaball(vec2 uv, vec2 center, float aspect, float r) {
  vec2  d     = vec2((uv.x - center.x) * aspect, uv.y - center.y);
  float dist2 = dot(d, d);
  return r / (dist2 + r);
}

vec3 colorRamp(float heat) {
  float h = min(heat, uPeakCap) / uPeakCap;
  if (h < 0.15) return mix(uC0col, uC1col, h / 0.15);
  if (h < 0.38) return mix(uC1col, uC2col, (h - 0.15) / 0.23);
  if (h < 0.65) return mix(uC2col, uC3col, (h - 0.38) / 0.27);
  return              mix(uC3col, uC4col, (h - 0.65) / 0.35);
}

void main() {
  vec2  uv     = gl_FragCoord.xy / uResolution;
  float aspect = uResolution.x / uResolution.y;
  float t      = uTime * 0.06;

  // Organic fbm warp
  vec2 wc   = uv * 1.6 + vec2(t * 0.09, t * 0.07);
  vec2 warp = vec2(
    (fbm(wc)                   - 0.5) * 0.09,
    (fbm(wc + vec2(4.1, 2.7)) - 0.5) * 0.09
  );
  vec2 suv = uv + warp;

  // Blob size normalised to a 900px reference so they feel the same
  // physical size on any screen or pixel density.
  float minDim = min(uResolution.x, uResolution.y);
  float sp     = uSpread * uSpread * 0.048 * (900.0 / minDim);

  // Warm metaball field
  float warm =
      metaball(suv, uW0, aspect, sp * 1.10)
    + metaball(suv, uW1, aspect, sp * 0.95)
    + metaball(suv, uW2, aspect, sp * 0.85)
    + metaball(suv, uW3, aspect, sp * 0.80)
    + metaball(suv, uW4, aspect, sp * 0.75)
    + metaball(suv, uMouse, aspect, sp * 0.75) * uMouseBlend;

  // Cold metaball field (subtracts heat)
  float cold = (
      metaball(suv, uC0, aspect, sp * 0.60)
    + metaball(suv, uC1, aspect, sp * 0.50)
    + metaball(suv, uC2, aspect, sp * 0.55)
    + metaball(suv, uC3, aspect, sp * 0.45)
  ) * uColdStrength;

  float heat  = clamp(warm - cold, 0.0, 1.0);
  vec3  color = colorRamp(heat);

  float grainTime  = uTime * uGrainSpeed;
  float grainFloor = floor(grainTime);
  float grainFract = fract(grainTime);

  vec2 grainUV = floor(uv * uResolution / (uGrainSize * uDPR)) / (uResolution / (uGrainSize * uDPR));

  // hash the frame index itself first — converts linear stepping into
  // a pseudo-random scatter so no two consecutive frames hit nearby hash space
  vec2 offsetA = vec2(hash(vec2(grainFloor, 0.0)), hash(vec2(0.0, grainFloor))) * 100.0;
  vec2 offsetB = vec2(hash(vec2(grainFloor + 1.0, 0.0)), hash(vec2(0.0, grainFloor + 1.0))) * 100.0;

  float grA = (hash(grainUV + offsetA) - 0.5);
  float grB = (hash(grainUV + offsetB) - 0.5);
  float gr  = mix(grA, grB, grainFract) * uGrain;

  color = clamp(color + gr, 0.0, 1.0);

  gl_FragColor = vec4(color, 1.0);
}
`

const vertexShader = `
  void main() {
    gl_Position = vec4(position, 1.0);
  }
`

// ─── Component ───
// Props:
//   mousePosition — { x: [0,1], y: [0,1] } where (0,0) is top-left
//   windowSize    — { x: innerWidth, y: innerHeight } in CSS pixels
export default function MovingGradient({ mousePosition, windowSize }) {
  const mat = useRef()
  const mouseBlobPos = useRef(new THREE.Vector2(0.5, 0.5))

  const { speed, randomness, numWarm, numCold } = useControls('Motion', {
    speed: { value: 0.2, min: 0.01, max: 5.0, step: 0.01 },
    randomness: { value: 0.1, min: 0.0, max: 1.0, step: 0.01 },
    numWarm: { value: 3, min: 1, max: MAX_WARM, step: 1, label: 'warm blobs' },
    numCold: { value: 2, min: 0, max: MAX_COLD, step: 1, label: 'cold blobs' },
  })

  const { grain, grainSize, grainSpeed, spread, mouseBlend, mouseLag, coldStrength } = useControls('Blobs', {
    grain: { value: 0.04, min: 0.0, max: 0.10, step: 0.001 },
    grainSize: { value: 20.0, min: 1.0, max: 20.0, step: 1.0 },
    grainSpeed: { value: 2.0, min: 1.0, max: 15.0, step: 1.0, label: 'grain speed' },
    spread: { value: 1.6, min: 0.5, max: 5.0, step: 0.05 },
    mouseBlend: { value: 0.70, min: 0.0, max: 1.0, step: 0.01, label: 'mouse blob strength' },
    mouseLag: { value: 0.045, min: 0.005, max: 0.2, step: 0.005, label: 'mouse lag' },
    coldStrength: { value: 0.65, min: 0.0, max: 1.0, step: 0.01, label: 'cold blob strength' },
  })

  const { stop0, stop1, stop2, stop3, stop4, peakCap } = useControls('Colors', {
    stop0: { value: '#000000', label: 'black' },
    stop1: { value: '#280200', label: 'dark red-brown' },
    stop2: { value: '#730100', label: 'muddy crimson' },
    stop3: { value: '#cd3310', label: 'red-orange' },
    stop4: { value: '#e8a06a', label: 'peak (warm core)' },
    peakCap: { value: 0.82, min: 0.3, max: 3.0, step: 0.01, label: 'peak brightness cap' },
  })

  // ─── shaderMaterial ─── 
  const GradientMaterial = shaderMaterial(
    {
      uTime:         0,
      uResolution:   new THREE.Vector2(1, 1),
      uMouse:        new THREE.Vector2(0.5, 0.5),
      uGrain:        grain,
      uGrainSize: grainSize,
      uGrainSpeed: grainSpeed,
      uDPR: 1.0,
      uSpread:       spread,
      uMouseBlend:   mouseBlend,
      uColdStrength: coldStrength,
      uPeakCap:      0.82,
      uC0col:        new THREE.Color(stop0),
      uC1col:        new THREE.Color(stop1),
      uC2col:        new THREE.Color(stop2),
      uC3col:        new THREE.Color(stop3),
      uC4col:        new THREE.Color(stop4),
      uW0: new THREE.Vector2(-99, -99),
      uW1: new THREE.Vector2(-99, -99),
      uW2: new THREE.Vector2(-99, -99),
      uW3: new THREE.Vector2(-99, -99),
      uW4: new THREE.Vector2(-99, -99),
      uC0: new THREE.Vector2(-99, -99),
      uC1: new THREE.Vector2(-99, -99),
      uC2: new THREE.Vector2(-99, -99),
      uC3: new THREE.Vector2(-99, -99),
    },
    vertexShader,
    fragmentShader
  )

  extend({ GradientMaterial })

  useFrame(({ clock }) => {
    if (!mat.current) return
    const m = mat.current
    const t = clock.elapsedTime * speed

    // Physical pixel resolution — multiply CSS pixels by DPR so the
    // blob size reference in the shader matches actual rendered pixels.
    const dpr = window.devicePixelRatio || 1
    m.uResolution.set(windowSize.x * dpr, windowSize.y * dpr)
    m.uTime = clock.elapsedTime

    // mousePosition arrives as { x: [0,1], y: [0,1] } with y=0 at top.
    // Shader UV has y=0 at bottom, so flip Y.
    const mx = mousePosition.x
    const my = 1.0 - mousePosition.y
    mouseBlobPos.current.lerp({ x: mx, y: my }, mouseLag)
    m.uMouse.copy(mouseBlobPos.current)

    m.uGrain = grain
    m.uGrainSize = grainSize
    m.uGrainSpeed = grainSpeed
    m.uDPR = window.devicePixelRatio || 1

    m.uSpread = spread
    m.uMouseBlend = mouseBlend
    m.uColdStrength = coldStrength
    m.uPeakCap = peakCap

    m.uC0col.set(stop0)
    m.uC1col.set(stop1)
    m.uC2col.set(stop2)
    m.uC3col.set(stop3)
    m.uC4col.set(stop4)

    for (let i = 0; i < MAX_WARM; i++) {
      if (i < numWarm) {
        const [fx1, fx2, fy1, fy2, px, py] = WARM_FREQS[i]
        const [x, y] = lissajous(t, fx1, fx2, fy1, fy2, px, py, randomness)
        m[warmKeys[i]].set(x, y)
      } else {
        m[warmKeys[i]].set(-99, -99)
      }
    }

    for (let i = 0; i < MAX_COLD; i++) {
      if (i < numCold) {
        const [fx1, fx2, fy1, fy2, px, py] = COLD_FREQS[i]
        const [x, y] = lissajous(t, fx1, fx2, fy1, fy2, px, py, randomness)
        m[coldKeys[i]].set(x, y)
      } else {
        m[coldKeys[i]].set(-99, -99)
      }
    }
  })

  return (
    <mesh>
      <planeGeometry args={[2, 2]} />
      <gradientMaterial ref={mat} depthWrite={false} />
    </mesh>
  )
}