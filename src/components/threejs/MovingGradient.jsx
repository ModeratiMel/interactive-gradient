import * as THREE from 'three'
import { shaderMaterial } from '@react-three/drei'
import { extend, useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import { useControls } from 'leva'

const fragmentShader = /* glsl */`
precision highp float;

uniform float uTime;
uniform vec2  uResolution;
uniform vec2  uMouse;

uniform float uBeamAngle;
uniform float uConeAngle;
uniform float uFalloff;
uniform float uSourceDist;
uniform float uWarpStrength;
uniform float uAmbient;
uniform float uPeakCap;

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

  // ── Organic warp ──────────────────────────────────────────────────────
  vec2  wc   = uv * 1.3 + vec2(t * 0.07, t * 0.05);
  float warp = (fbm(wc) - 0.5) * uWarpStrength;
  vec2  wuv  = uv + warp;

  // ── Light source position ─────────────────────────────────────────────
  // The source sits outside/at the edge of the screen, offset from the
  // mouse in the opposite direction of the beam. This way moving the mouse
  // pans where the beam illuminates, rather than moving the origin point.
  vec2 beamDir = vec2(cos(uBeamAngle), sin(uBeamAngle));
  vec2 source  = uMouse - beamDir * uSourceDist;

  // ── Vector from source to this pixel (aspect corrected) ──────────────
  vec2  toPixel  = vec2((wuv.x - source.x) * aspect, wuv.y - source.y);
  float dist     = length(toPixel);

  // Avoid division by zero right at the source
  vec2  dir      = dist > 0.001 ? toPixel / dist : beamDir;

  // ── Cone: angle between pixel direction and beam direction ────────────
  // dot(dir, beamDir) = cos(angle between them)
  // 1.0 = exactly on axis, 0.0 = 90deg off axis, -1.0 = behind source
  float cosAngle = dot(dir, beamDir);

  // Only pixels in front of the source (cosAngle > 0) get lit.
  // smoothstep from the cone edge inward gives soft penumbra.
  float cosConeEdge = cos(uConeAngle);           // half-angle of cone in radians
  float cone = smoothstep(cosConeEdge, mix(cosConeEdge, 1.0, 0.6), cosAngle);

  // Cut off anything behind the source cleanly
  cone *= step(0.0, cosAngle);

  // ── Distance falloff ──────────────────────────────────────────────────
  // exp(-dist * falloff) — light fades as it travels from source
  float distFade = exp(-dist * uFalloff);

  // ── Combined heat ─────────────────────────────────────────────────────
  float heat = clamp(uAmbient + cone * distFade, 0.0, 1.0);

  vec3 color = colorRamp(heat);

  // ── Grain ─────────────────────────────────────────────────────────────
  float grainTime  = uTime * uGrainSpeed;
  float grainFloor = floor(grainTime);
  float grainFract = fract(grainTime);

  vec2 grainUV = floor(uv * uResolution / uGrainSize) / (uResolution / uGrainSize);

  vec2 offsetA = vec2(hash(vec2(grainFloor,       0.0)), hash(vec2(0.0, grainFloor      ))) * 100.0;
  vec2 offsetB = vec2(hash(vec2(grainFloor + 1.0, 0.0)), hash(vec2(0.0, grainFloor + 1.0))) * 100.0;

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

const FlashlightMaterial = shaderMaterial(
  {
    uTime:         0,
    uResolution:   new THREE.Vector2(1, 1),
    uMouse:        new THREE.Vector2(0.5, 0.5),
    uBeamAngle:    Math.PI * 0.75,
    uConeAngle:    0.7,
    uFalloff:      1.4,
    uSourceDist:   0.5,
    uWarpStrength: 0.18,
    uAmbient:      0.02,
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

// Props:
//   mousePosition — { x: [0,1], y: [0,1] } where (0,0) is top-left
//   windowSize    — { x: innerWidth, y: innerHeight } in CSS pixels
export default function FlashlightGradient({ mousePosition, windowSize }) {
  const mat         = useRef()
  const smoothMouse = useRef(new THREE.Vector2(0.5, 0.5))

  const { beamAngle, coneAngle, falloff, sourceDist, warpStrength, ambient } = useControls('Light', {
    // Degrees — easier to think about than radians
    beamAngle:    { value: 135,  min: 0,   max: 360,  step: 1,    label: 'beam angle (deg)' },
    // Cone half-angle in radians — how wide the beam spreads
    coneAngle:    { value: 0.7,  min: 0.1, max: 1.5,  step: 0.05, label: 'cone width (rad)' },
    falloff:      { value: 1.4,  min: 0.1, max: 6.0,  step: 0.1,  label: 'falloff' },
    // How far behind the mouse the source sits — larger = source further off screen
    sourceDist:   { value: 0.5,  min: 0.0, max: 2.0,  step: 0.05, label: 'source distance' },
    warpStrength: { value: 0.18, min: 0.0, max: 0.6,  step: 0.01, label: 'edge warp' },
    ambient:      { value: 0.02, min: 0.0, max: 0.3,  step: 0.01, label: 'ambient floor' },
  })

  const { mouseLag } = useControls('Mouse', {
    mouseLag: { value: 0.06, min: 0.005, max: 0.2, step: 0.005, label: 'mouse lag' },
  })

  const { grain, grainSize, grainSpeed } = useControls('Grain', {
    grain:      { value: 0.04, min: 0.0, max: 0.10, step: 0.001 },
    grainSize:  { value: 3.0,  min: 1.0, max: 10.0, step: 1.0   },
    grainSpeed: { value: 2.0,  min: 0.5, max: 8.0,  step: 0.5,  label: 'grain speed (fps)' },
  })

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

    const mx = mousePosition.x
    const my = 1.0 - mousePosition.y
    smoothMouse.current.lerp({ x: mx, y: my }, mouseLag)
    m.uMouse.copy(smoothMouse.current)

    m.uBeamAngle    = (beamAngle * Math.PI) / 180
    m.uConeAngle    = coneAngle
    m.uFalloff      = falloff
    m.uSourceDist   = sourceDist
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