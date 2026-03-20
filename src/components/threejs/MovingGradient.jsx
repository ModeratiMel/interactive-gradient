import { useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useControls } from 'leva'

export default function SmoothGradient() {
  const material = useRef()
  const { size, mouse } = useThree()

  const smoothMouse = useRef([0.5, 0.5])
  const prevMouse   = useRef([0.5, 0.5])

  const { speed, grain, spread, deformStrength, deformRadius, mouseLerp } =
    useControls('Gradient', {
      speed:          { value: 0.08,  min: 0.01, max: 0.4,  step: 0.005 },
      grain:          { value: 0.030, min: 0.0,  max: 0.10, step: 0.001 },
      spread:         { value: 1.0,   min: 0.5,  max: 2.0,  step: 0.05  },
      deformStrength: { value: 0.30,  min: 0.0,  max: 0.8,  step: 0.01  },
      deformRadius:   { value: 0.45,  min: 0.05, max: 0.9,  step: 0.01  },
      mouseLerp:      { value: 0.055, min: 0.005,max: 0.2,  step: 0.005,
                        label: 'mouse smoothing' },
    })

  useFrame(({ clock }) => {
    if (!material.current) return
    const u = material.current.uniforms
    const t = clock.elapsedTime

    const mx = (mouse.x + 1) / 2
    const my = (mouse.y + 1) / 2

    const velX = mx - prevMouse.current[0]
    const velY = my - prevMouse.current[1]
    prevMouse.current = [mx, my]

    smoothMouse.current[0] += (mx - smoothMouse.current[0]) * mouseLerp
    smoothMouse.current[1] += (my - smoothMouse.current[1]) * mouseLerp

    // Blob wanders using Lissajous-style sine paths.
    // Amplitude keeps range within [0,1] — full screen.
    const bx  = 0.5 + Math.sin(t * 0.11) * 0.38 + Math.sin(t * 0.07) * 0.12
    const by  = 0.5 + Math.cos(t * 0.09) * 0.38 + Math.cos(t * 0.05) * 0.12
    // Source B orbits Source A — keeps the red fringe attached to the warm core
    const bx2 = bx - 0.18 + Math.sin(t * 0.13) * 0.04
    const by2 = by - 0.12 + Math.cos(t * 0.11) * 0.06

    u.uTime.value           = t
    u.uResolution.value     = [size.width, size.height]
    u.uMouse.value          = [...smoothMouse.current]
    u.uMouseVel.value       = [velX, velY]
    u.uSpeed.value          = speed
    u.uGrain.value          = grain
    u.uSpread.value         = spread
    u.uDeformStrength.value = deformStrength
    u.uDeformRadius.value   = deformRadius
    u.uSrcA.value           = [bx,  by]
    u.uSrcB.value           = [bx2, by2]
  })

  return (
    <mesh>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial
        ref={material}
        uniforms={{
          uTime:           { value: 0 },
          uResolution:     { value: [size.width, size.height] },
          uMouse:          { value: [0.5, 0.5] },
          uMouseVel:       { value: [0.0, 0.0] },
          uSpeed:          { value: speed },
          uGrain:          { value: grain },
          uSpread:         { value: spread },
          uDeformStrength: { value: deformStrength },
          uDeformRadius:   { value: deformRadius },
          uSrcA:           { value: [0.2, 0.8] },
          uSrcB:           { value: [0.0, 0.5] },
        }}
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

// ─────────────────────────────────────────────────────────────────────────────
// Core idea:
//   Instead of a radial blob, we build a smooth scalar "heat" field by
//   blending two off-screen light sources — one upper-left (peach/tan warmth)
//   and one left-edge (saturated red fringe) — then map that heat value
//   through a color ramp that goes:
//
//   1.0  →  muted peachy tan      (the brightest region, upper-left)
//   0.7  →  vivid red-orange      (left-edge fringe)
//   0.45 →  dark muddy crimson    (the wide middle region)
//   0.15 →  near-black dark red   (lower-right shadow)
//   0.0  →  pure black
//
//   No smoothstep hard stops — we use pure mix() with gentle power curves
//   so every transition is film-smooth.
// ─────────────────────────────────────────────────────────────────────────────

const fragmentShader = `
precision highp float;

uniform float uTime;
uniform vec2  uResolution;
uniform vec2  uMouse;
uniform vec2  uMouseVel;
uniform float uSpeed;
uniform float uGrain;
uniform float uSpread;
uniform float uDeformStrength;
uniform float uDeformRadius;
uniform vec2  uSrcA;
uniform vec2  uSrcB;

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

// 4-octave fbm — used only for gentle warp, kept subtle
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += noise(p) * a;
    p  = p * 2.07 + vec2(1.3, 0.9);
    a *= 0.50;
  }
  return v;
}

// Smooth falloff from a point — no hard edge, pure gaussian-ish
float lightFalloff(vec2 uv, vec2 source, float radius) {
  float d = length(uv - source);
  // use an exponential curve for extra smoothness at the tail
  return exp(-d * d / (radius * radius * 0.5));
}

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;
  float aspect = uResolution.x / uResolution.y;
  float t = uTime * uSpeed;

  // ── Mouse deformation ───────────────────────────────────────────────
  // Pull UVs toward the mouse within deformRadius.
  // Velocity adds an extra stretch when moving fast.
  vec2  toMouse  = uMouse - uv;
  vec2  toMouseA = vec2(toMouse.x * aspect, toMouse.y);
  float mDist    = length(toMouseA);
  float mInfl    = smoothstep(uDeformRadius, 0.0, mDist);
  float velBoost = 1.0 + length(uMouseVel) * 22.0;
  vec2  wuv      = uv + toMouse * mInfl * uDeformStrength * velBoost;

  // ── Gentle organic warp (very slow, very subtle) ────────────────────
  float warpScale = 1.4 / uSpread;
  vec2  warpCoord = wuv * warpScale + vec2(t * 0.07, t * 0.05);
  float warpX = (fbm(warpCoord)              - 0.5) * 0.10;
  float warpY = (fbm(warpCoord + vec2(5.2, 1.3)) - 0.5) * 0.10;
  vec2  swuv  = wuv + vec2(warpX, warpY);

  // ── Two light sources driven from JS (bouncing paths) ──────────────
  vec2 srcA = uSrcA;
  vec2 srcB = uSrcB;

  // Aspect-correct the source distances
  vec2 dA = vec2((swuv.x - srcA.x) * aspect, swuv.y - srcA.y);
  vec2 dB = vec2((swuv.x - srcB.x) * aspect, swuv.y - srcB.y);

  float heatA = exp(-dot(dA, dA) / (uSpread * uSpread * 0.72));
  float heatB = exp(-dot(dB, dB) / (uSpread * uSpread * 0.28));

  // Combine: A gives the broad warm sweep, B gives the red left-edge kick
  float heat = heatA * 0.65 + heatB * 0.50;
  heat = clamp(heat, 0.0, 1.0);

  // ── Color ramp ──────────────────────────────────────────────────────
  // Sampled at key heat values matching the reference image:
  //
  //  heat ≈ 1.0   peachy tan highlight   (212, 155, 110)
  //  heat ≈ 0.75  muted warm salmon      (185, 95,  55)
  //  heat ≈ 0.50  vivid red-orange       (195, 45,  10)  ← left-fringe colour
  //  heat ≈ 0.28  dark muddy crimson     (95,  18,  8)
  //  heat ≈ 0.10  very dark red-brown    (30,  5,   3)
  //  heat ≈ 0.0   black
  //
  // We build the ramp by repeated mix() calls — no smoothstep transitions,
  // just linear blends so the whole thing stays film-smooth.

  vec3 c0 = vec3(0.000, 0.000, 0.000);  // black
  vec3 c1 = vec3(0.118, 0.020, 0.012);  // very dark red-brown
  vec3 c2 = vec3(0.373, 0.071, 0.031);  // dark muddy crimson
  vec3 c3 = vec3(0.765, 0.176, 0.039);  // vivid red-orange
  vec3 c4 = vec3(0.725, 0.373, 0.216);  // muted warm salmon
  vec3 c5 = vec3(0.831, 0.608, 0.431);  // peachy tan highlight

  // Piecewise linear ramp — each segment covers a heat band
  // Using clamp(x,0,1) for the t values keeps everything clean
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

  // ── Grain ──────────────────────────────────────────────────────────
  float gr = (hash(uv + fract(t) * 71.3) - 0.5) * uGrain;
  color = clamp(color + gr, 0.0, 1.0);

  gl_FragColor = vec4(color, 1.0);
}
`