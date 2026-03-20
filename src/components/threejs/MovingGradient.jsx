import * as THREE from 'three'
import { shaderMaterial } from '@react-three/drei'
import { extend, useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import { useControls } from 'leva'

// ─── Shaders ───
const fragmentShader = /* glsl */`
precision highp float;

uniform float uTime;
uniform vec2  uResolution;
uniform vec2  uMouse;

uniform float uFalloff;
uniform float uSpreadX;
uniform float uSpreadY;
uniform float uWarpStrength;
uniform float uAmbient;
uniform float uPeakCap;
uniform float uMouseLag;

uniform float uGrain;
uniform float uGrainSize;
uniform float uGrainSpeed;

uniform vec3  uC0col;
uniform vec3  uC1col;
uniform vec3  uC2col;
uniform vec3  uC3col;
uniform vec3  uC4col;

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
  float t      = uTime * 0.04;

  // Slow organic warp — roughens the light edge so it isn't a perfect ellipse
  vec2 wc   = uv * 1.3 + vec2(t * 0.07, t * 0.05);
  float warp = (fbm(wc) - 0.5) * uWarpStrength;

  // Elliptical distance from mouse — spreadX/Y squash the circle independently
  vec2  delta = uv - uMouse;
  delta.x    *= aspect * uSpreadX;
  delta.y    *= uSpreadY;
  float dist  = length(delta) + warp;

  // Exponential falloff — trails off smoothly with no hard edge ever
  float light = exp(-dist * uFalloff);

  // Ambient floor so it never goes fully black away from the mouse
  float heat = clamp(uAmbient + light, 0.0, 1.0);

  vec3 color = colorRamp(heat);

  // ── Grain (identical to blob version) ────────────────────────────────
  float grainTime  = uTime * uGrainSpeed;
  float grainFloor = floor(grainTime);
  float grainFract = fract(grainTime);

  vec2 grainUV = floor(uv * uResolution / uGrainSize) / (uResolution / uGrainSize);

  vec2 offsetA = vec2(hash(vec2(grainFloor, 0.0)),        hash(vec2(0.0, grainFloor)))        * 100.0;
  vec2 offsetB = vec2(hash(vec2(grainFloor + 1.0, 0.0)),  hash(vec2(0.0, grainFloor + 1.0)))  * 100.0;

  float grA = hash(grainUV + offsetA) - 0.5;
  float grB = hash(grainUV + offsetB) - 0.5;
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

// ─── shaderMaterial ───
const FlashlightMaterial = shaderMaterial(
  {
    uTime:         0,
    uResolution:   new THREE.Vector2(1, 1),
    uMouse:        new THREE.Vector2(0.5, 0.5),
    uFalloff:      2.5,
    uSpreadX:      0.8,
    uSpreadY:      1.2,
    uWarpStrength: 0.15,
    uAmbient:      0.0,
    uPeakCap:      0.82,
    uGrain:        0.04,
    uGrainSize:    3.0,
    uGrainSpeed:   2.0,
    uC0col:        new THREE.Color('#000000'),
    uC1col:        new THREE.Color('#280200'),
    uC2col:        new THREE.Color('#730100'),
    uC3col:        new THREE.Color('#cd3310'),
    uC4col:        new THREE.Color('#e8a06a'),
  },
  vertexShader,
  fragmentShader
)

extend({ FlashlightMaterial })

// ─── Component ───
// Props:
//   mousePosition — { x: [0,1], y: [0,1] } where (0,0) is top-left
//   windowSize    — { x: innerWidth, y: innerHeight } in CSS pixels
export default function MovingGradient({ mousePosition, windowSize }) {
  const mat          = useRef()
  const smoothMouse  = useRef(new THREE.Vector2(0.5, 0.5))

  // ── Light ──
  const { falloff, spreadX, spreadY, warpStrength, ambient } = useControls('Light', {
    falloff:      { value: 2.5,  min: 0.2,  max: 10.0, step: 0.1,  label: 'falloff' },
    spreadX:      { value: 0.8,  min: 0.1,  max: 3.0,  step: 0.05, label: 'spread X' },
    spreadY:      { value: 1.2,  min: 0.1,  max: 3.0,  step: 0.05, label: 'spread Y' },
    warpStrength: { value: 0.15, min: 0.0,  max: 0.6,  step: 0.01, label: 'edge warp' },
    ambient:      { value: 0.0,  min: 0.0,  max: 0.5,  step: 0.01, label: 'ambient floor' },
  })

  // ── Mouse ──
  const { mouseLag } = useControls('Mouse', {
    mouseLag: { value: 0.045, min: 0.005, max: 0.2, step: 0.005, label: 'mouse lag' },
  })

  // ── Grain ──
  const { grain, grainSize, grainSpeed } = useControls('Grain', {
    grain:      { value: 0.04,  min: 0.0, max: 0.10, step: 0.001 },
    grainSize:  { value: 3.0,   min: 1.0, max: 10.0, step: 1.0   },
    grainSpeed: { value: 2.0,   min: 0.5, max: 8.0,  step: 0.5,  label: 'grain speed (fps)' },
  })

  // ── Colors ──
  const { stop0, stop1, stop2, stop3, stop4, peakCap } = useControls('Colors', {
    stop0:   { value: '#000000', label: 'black' },
    stop1:   { value: '#280200', label: 'dark red-brown' },
    stop2:   { value: '#730100', label: 'muddy crimson' },
    stop3:   { value: '#cd3310', label: 'red-orange' },
    stop4:   { value: '#e8a06a', label: 'peak (warm core)' },
    peakCap: { value: 0.82, min: 0.3, max: 1.0, step: 0.01, label: 'peak brightness cap' },
  })

  useFrame(({ clock }) => {
    if (!mat.current) return
    const m = mat.current

    const dpr = window.devicePixelRatio || 1
    m.uResolution.set(windowSize.x * dpr, windowSize.y * dpr)
    m.uTime = clock.elapsedTime

    // Flip Y: browser y=0 is top, shader UV y=0 is bottom
    const mx = mousePosition.x
    const my = 1.0 - mousePosition.y
    smoothMouse.current.lerp({ x: mx, y: my }, mouseLag)
    m.uMouse.copy(smoothMouse.current)

    m.uFalloff      = falloff
    m.uSpreadX      = spreadX
    m.uSpreadY      = spreadY
    m.uWarpStrength = warpStrength
    m.uAmbient      = ambient
    m.uPeakCap      = peakCap

    m.uGrain      = grain
    m.uGrainSize  = grainSize
    m.uGrainSpeed = grainSpeed

    m.uC0col.set(stop0)
    m.uC1col.set(stop1)
    m.uC2col.set(stop2)
    m.uC3col.set(stop3)
    m.uC4col.set(stop4)
  })

  return (
    <mesh>
      <planeGeometry args={[2, 2]} />
      <flashlightMaterial ref={mat} depthWrite={false} />
    </mesh>
  )
}