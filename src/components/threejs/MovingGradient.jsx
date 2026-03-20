import { useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

export default function SmoothGradient({
  speed = 0.05,
  grain = 0.02,
}) {
  const material = useRef()
  const { size } = useThree()

  useFrame(({ clock }) => {
    if (material.current) {
      material.current.uniforms.uTime.value = clock.elapsedTime
      material.current.uniforms.uResolution.value = [size.width, size.height]
    }
  })

  return (
    <mesh>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial
        ref={material}
        uniforms={{
          uTime: { value: 0 },
          uResolution: { value: [size.width, size.height] },
          uSpeed: { value: speed },
          uGrain: { value: grain },
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

const fragmentShader = `
uniform float uTime;
uniform vec2 uResolution;
uniform float uSpeed;
uniform float uGrain;

// subtle random for grain
float random(vec2 uv) {
  return fract(sin(dot(uv, vec2(12.9898,78.233))) * 43758.5453);
}

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;

  float t = uTime * uSpeed;

  // smooth flowing field (THIS is the key)
  float field =
    sin(uv.x * 3.0 + t) +
    sin(uv.y * 3.0 - t * 0.7) +
    sin((uv.x + uv.y) * 2.0 + t * 0.5);

  field /= 3.0; // normalize

  // remap to 0–1
  float gradient = field * 0.5 + 0.5;

  // colors
  vec3 black = vec3(0.0);
  vec3 orange = vec3(1.0, 0.4, 0.0);
  vec3 white = vec3(1.0);

  // mostly black, with highlights
  vec3 color = mix(black, orange, smoothstep(0.4, 0.7, gradient));
  color = mix(color, white, smoothstep(0.75, 1.0, gradient));

  // subtle grain overlay
  float g = (random(uv + uTime * 2.0) - 0.5) * uGrain;
  color += g;

  gl_FragColor = vec4(color, 1.0);
}
`