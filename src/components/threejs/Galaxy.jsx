import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { useControls } from 'leva'
import * as THREE from 'three'

const vertexShader = `
  uniform float uTime;
  uniform float uSize;

  attribute vec3 aRandomness;
  attribute float aScale;

  varying vec3 vColor;

  void main() {
    vec4 modelPosition = modelMatrix * vec4(position, 1.0);

    // Spin
    float angle = atan(modelPosition.x, modelPosition.z);
    float distanceToCenter = length(modelPosition.xz);
    float angleOffset = (1.0 / distanceToCenter) * uTime * 0.2;
    angle += angleOffset;

    modelPosition.x = cos(angle) * distanceToCenter;
    modelPosition.z = sin(angle) * distanceToCenter;

    // Randomness
    modelPosition.xyz += aRandomness;

    vec4 viewPosition = viewMatrix * modelPosition;
    vec4 projectedPosition = projectionMatrix * viewPosition;
    gl_Position = projectedPosition;

    gl_PointSize = uSize * aScale;
    gl_PointSize *= (1.0 / - viewPosition.z);

    vColor = color;
  }
`

const fragmentShader = `
  varying vec3 vColor;

  void main() {
    float strength = distance(gl_PointCoord, vec2(0.5));
    strength = 1.0 - strength;
    strength = pow(strength, 10.0);

    vec3 color = mix(vec3(0.0), vColor, strength);
    gl_FragColor = vec4(color, 1.0);
  }
`

export default function Galaxy() {
  const materialRef = useRef()

  const {
    count,
    radius,
    branches,
    randomness,
    randomnessPower,
    insideColor,
    outsideColor,
  } = useControls('Galaxy', {
    count:           { value: 200000, min: 100,  max: 1000000, step: 100 },
    radius:          { value: 5,      min: 0.01, max: 20,      step: 0.01 },
    branches:        { value: 3,      min: 2,    max: 20,      step: 1 },
    randomness:      { value: 0.2,    min: 0,    max: 2,       step: 0.001 },
    randomnessPower: { value: 3,      min: 1,    max: 10,      step: 0.001 },
    insideColor:     '#ff6030',
    outsideColor:    '#1b3984',
  })

  const { positions, randomnessAttr, colors, scales } = useMemo(() => {
    const positions      = new Float32Array(count * 3)
    const randomnessAttr = new Float32Array(count * 3)
    const colors         = new Float32Array(count * 3)
    const scales         = new Float32Array(count)

    const colorInside  = new THREE.Color(insideColor)
    const colorOutside = new THREE.Color(outsideColor)

    for (let i = 0; i < count; i++) {
      const i3 = i * 3

      const r           = Math.random() * radius
      const branchAngle = ((i % branches) / branches) * Math.PI * 2

      const rx = Math.pow(Math.random(), randomnessPower) * (Math.random() < 0.5 ? 1 : -1) * randomness * r
      const ry = Math.pow(Math.random(), randomnessPower) * (Math.random() < 0.5 ? 1 : -1) * randomness * r
      const rz = Math.pow(Math.random(), randomnessPower) * (Math.random() < 0.5 ? 1 : -1) * randomness * r

      positions[i3]     = Math.cos(branchAngle) * r
      positions[i3 + 1] = 0
      positions[i3 + 2] = Math.sin(branchAngle) * r

      randomnessAttr[i3]     = rx
      randomnessAttr[i3 + 1] = ry
      randomnessAttr[i3 + 2] = rz

      const mixed = colorInside.clone().lerp(colorOutside, r / radius)
      colors[i3]     = mixed.r
      colors[i3 + 1] = mixed.g
      colors[i3 + 2] = mixed.b

      scales[i] = Math.random()
    }

    return { positions, randomnessAttr, colors, scales }
  }, [count, radius, branches, randomness, randomnessPower, insideColor, outsideColor])

  useFrame(({ clock, gl }) => {
    if (materialRef.current) {
      materialRef.current.uniforms.uTime.value  = clock.getElapsedTime()
    }
  })

  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
    uSize: { value: 30 * window.devicePixelRatio },
  }), [])

  return (
    <points>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position"    args={[positions,      3]} />
        <bufferAttribute attach="attributes-aRandomness" args={[randomnessAttr, 3]} />
        <bufferAttribute attach="attributes-color"       args={[colors,         3]} />
        <bufferAttribute attach="attributes-aScale"      args={[scales,         1]} />
      </bufferGeometry>
      <shaderMaterial
        ref={materialRef}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        vertexColors={true}
        uniforms={uniforms}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
      />
    </points>
  )
}