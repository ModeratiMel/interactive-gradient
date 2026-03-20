import { useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useControls } from 'leva'

// ─── Lissajous path helper ────────────────────────────────────────────────────
// Returns a position in [margin, 1-margin] using two incommensurable
// sine waves so the path never repeats and naturally reverses at bounds.
function lissajous(t, fx1, fx2, fy1, fy2, px, py, margin = 0.08) {
  const range = 0.5 - margin
  const x = 0.5 + Math.sin(t * fx1 + px) * range * 0.7 + Math.sin(t * fx2) * range * 0.3
  const y = 0.5 + Math.cos(t * fy1 + py) * range * 0.7 + Math.cos(t * fy2) * range * 0.3
  return [x, y]
}

export default function SmoothGradient() {
  const material   = useRef()
  const { size, mouse } = useThree()

  // Smoothed mouse blob position — lags behind cursor for organic feel
  const mouseBlobPos = useRef([0.5, 0.5])
  const prevMouse    = useRef([0.5, 0.5])

  const { speed, grain, spread, mouseBlend, mouseLag, coldStrength } =
    useControls('Gradient', {
      speed:        { value: 0.10,  min: 0.01, max: 0.5,  step: 0.005 },
      grain:        { value: 0.030, min: 0.0,  max: 0.10, step: 0.001 },
      spread:       { value: 1.5,  min: 0.4,  max: 2.0,  step: 0.05  },
      mouseBlend:   { value: 0.70,  min: 0.0,  max: 1.0,  step: 0.01,
                      label: 'mouse blob strength' },
      mouseLag:     { value: 0.045, min: 0.005,max: 0.2,  step: 0.005,
                      label: 'mouse lag' },
      coldStrength: { value: 0.55,  min: 0.0,  max: 1.0,  step: 0.01,
                      label: 'cold blob strength' },
    })

  useFrame(({ clock }) => {
    if (!material.current) return
    const u = material.current.uniforms
    const t = clock.elapsedTime * speed

    // ── Mouse blob ──────────────────────────────────────────────────────
    const mx = (mouse.x + 1) / 2
    const my = (mouse.y + 1) / 2
    const velX = mx - prevMouse.current[0]
    const velY = my - prevMouse.current[1]
    prevMouse.current = [mx, my]
    mouseBlobPos.current[0] += (mx - mouseBlobPos.current[0]) * mouseLag
    mouseBlobPos.current[1] += (my - mouseBlobPos.current[1]) * mouseLag

    // ── Warm blobs (3) — independent Lissajous paths ──────────────────
    // Each gets different frequencies and phase offsets so they
    // wander independently, sometimes merging, sometimes splitting.
    const [w0x, w0y] = lissajous(t, 0.37, 0.19, 0.29, 0.11, 0.0,  1.1)
    const [w1x, w1y] = lissajous(t, 0.23, 0.41, 0.17, 0.31, 2.3,  0.7)
    const [w2x, w2y] = lissajous(t, 0.51, 0.13, 0.43, 0.22, 4.7,  3.2)

    // ── Cold / black blobs (2) — subtract heat, create dark voids ─────
    const [c0x, c0y] = lissajous(t, 0.28, 0.44, 0.35, 0.18, 1.5,  5.1)
    const [c1x, c1y] = lissajous(t, 0.19, 0.33, 0.52, 0.27, 6.2,  2.4)

    u.uTime.value        = clock.elapsedTime   // raw time for warp
    u.uResolution.value  = [size.width, size.height]
    u.uMouse.value       = [...mouseBlobPos.current]
    u.uMouseVel.value    = [velX, velY]
    u.uGrain.value       = grain
    u.uSpread.value      = spread
    u.uMouseBlend.value  = mouseBlend
    u.uColdStrength.value = coldStrength

    // warm blob positions
    u.uW0.value = [w0x, w0y]
    u.uW1.value = [w1x, w1y]
    u.uW2.value = [w2x, w2y]

    // cold blob positions
    u.uC0.value = [c0x, c0y]
    u.uC1.value = [c1x, c1y]
  })

  const initialUniforms = {
    uTime:         { value: 0 },
    uResolution:   { value: [size.width, size.height] },
    uMouse:        { value: [0.5, 0.5] },
    uMouseVel:     { value: [0.0, 0.0] },
    uGrain:        { value: grain },
    uSpread:       { value: spread },
    uMouseBlend:   { value: mouseBlend },
    uColdStrength: { value: coldStrength },
    uW0: { value: [0.3, 0.7] },
    uW1: { value: [0.7, 0.3] },
    uW2: { value: [0.5, 0.5] },
    uC0: { value: [0.2, 0.2] },
    uC1: { value: [0.8, 0.8] },
  }

  return (
    <mesh>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial
        ref={material}
        uniforms={initialUniforms}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        depthWrite={false}
      />
    </mesh>
  )
}

const vertexShader = `
  void main() {
    gl_Position = vec4(position, 1.0);
  }
`

const fragmentShader = `
precision highp float;

uniform float uTime;
uniform vec2  uResolution;
uniform vec2  uMouse;
uniform vec2  uMouseVel;
uniform float uGrain;
uniform float uSpread;
uniform float uMouseBlend;
uniform float uColdStrength;

uniform vec2  uW0;
uniform vec2  uW1;
uniform vec2  uW2;
uniform vec2  uC0;
uniform vec2  uC1;

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

// Metaball-style falloff: 1/d^2 gives natural merging when blobs are close
float metaball(vec2 uv, vec2 center, float aspect, float r) {
  vec2 d = vec2((uv.x - center.x) * aspect, uv.y - center.y);
  float dist2 = dot(d, d);
  return r / (dist2 + r);
}

void main() {
  vec2  uv     = gl_FragCoord.xy / uResolution;
  float aspect = uResolution.x / uResolution.y;
  float t      = uTime * 0.06;  // slow warp time, independent of speed control

  // ── Organic warp ────────────────────────────────────────────────────
  vec2 wc  = uv * 1.6 + vec2(t * 0.09, t * 0.07);
  vec2 warp = vec2(
    (fbm(wc)              - 0.5) * 0.09,
    (fbm(wc + vec2(4.1, 2.7)) - 0.5) * 0.09
  );
  vec2 suv = uv + warp;

  // ── Warm blob field (metaball sum) ──────────────────────────────────
  float sp = uSpread * uSpread * 0.048;
  float warmField =
      metaball(suv, uW0, aspect, sp * 1.10)
    + metaball(suv, uW1, aspect, sp * 0.85)
    + metaball(suv, uW2, aspect, sp * 0.70);

  // ── Mouse blob — same ramp, merges with warm field ──────────────────
  float mouseField = metaball(suv, uMouse, aspect, sp * 0.75) * uMouseBlend;
  warmField += mouseField;

  // ── Cold blob field — subtracts heat, punches dark voids ────────────
  float coldField =
      metaball(suv, uC0, aspect, sp * 0.55)
    + metaball(suv, uC1, aspect, sp * 0.45);
  coldField *= uColdStrength;

  // Net heat: warm sources minus cold voids, clamped to [0,1]
  float heat = clamp(warmField - coldField, 0.0, 1.0);

  // ── Color ramp (identical to reference-matched version) ─────────────
  vec3 c0 = vec3(0.000, 0.000, 0.000);  // black
  vec3 c1 = vec3(0.118, 0.020, 0.012);  // very dark red-brown
  vec3 c2 = vec3(0.373, 0.071, 0.031);  // dark muddy crimson
  vec3 c3 = vec3(0.765, 0.176, 0.039);  // vivid red-orange
  vec3 c4 = vec3(0.725, 0.373, 0.216);  // muted warm salmon
  vec3 c5 = vec3(0.831, 0.608, 0.431);  // peachy tan highlight

  vec3 color;
  if (heat < 0.10) {
    color = mix(c0, c1, heat / 0.10);
  } else if (heat < 0.28) {
    color = mix(c1, c2, (heat - 0.10) / 0.18);
  } else if (heat < 0.50) {
    color = mix(c2, c3, (heat - 0.28) / 0.22);
  } else if (heat < 0.75) {
    color = mix(c3, c4, (heat - 0.50) / 0.25);
  } else {
    color = mix(c4, c5, (heat - 0.75) / 0.25);
  }

  // ── Grain ────────────────────────────────────────────────────────────
  float gr = (hash(uv + fract(uTime * 0.1) * 71.3) - 0.5) * uGrain;
  color = clamp(color + gr, 0.0, 1.0);

  gl_FragColor = vec4(color, 1.0);
}
`