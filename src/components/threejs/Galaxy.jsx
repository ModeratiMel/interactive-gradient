// Galaxy.jsx
import * as THREE from 'three'
import { shaderMaterial, PerspectiveCamera, OrbitControls } from '@react-three/drei'
import galaxyVertexShader from './shaders/galaxy/vertex.glsl'
import galaxyFragmentShader from './shaders/galaxy/fragment.glsl'
import { extend, useFrame, useThree } from '@react-three/fiber'
import { useRef, useMemo, useEffect } from 'react'
import { useControls } from 'leva'

export default function Galaxy() {
    const { gl } = useThree()
    const materialRef = useRef()
    const cameraRef = useRef()
    const orbitRef = useRef()

    const {
        count,
        speed,
        size,
        radius,
        branches,
        randomness,
        randomnessPower,
        insideColor,
        outsideColor,
    } = useControls({
        count: { value: 5000, min: 100, max: 1000000, step: 100 },
        speed: { value: 0.01, min: 0.001, max: 5, step: 0.001 },
        size: { value: 10, min: 5,  max: 100, step: 5},
        radius:          { value: 5,      min: 0.01, max: 20,      step: 0.01  },
        branches:        { value: 3,      min: 2,    max: 20,      step: 1     },
        randomness:      { value: 1.20,    min: 0,    max: 2,       step: 0.001 },
        randomnessPower: { value: 1,      min: 1,    max: 10,      step: 0.001 },
        insideColor:     { value: '#ffe3cf' },
        outsideColor:    { value: '#9cfOff' },
    })

    const GalaxyMaterial = shaderMaterial(
        {
            uTime: 0,
            uSpeed: speed,
            uSize: size,
        },
        galaxyVertexShader,
        galaxyFragmentShader
    )
    extend({ GalaxyMaterial })

    // Regenerate geometry when params change
    const { positions, randomnessAttr, colors, scales } = useMemo(() => {
        const positions     = new Float32Array(count * 3)
        const randomnessAttr = new Float32Array(count * 3)
        const colors        = new Float32Array(count * 3)
        const scales        = new Float32Array(count)

        const colorInside  = new THREE.Color(insideColor)
        const colorOutside = new THREE.Color(outsideColor)

        for (let i = 0; i < count; i++) {
            const i3 = i * 3

            // Position
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

            // Color
            const mixed = colorInside.clone().lerp(colorOutside, r / radius)
            colors[i3]     = mixed.r
            colors[i3 + 1] = mixed.g
            colors[i3 + 2] = mixed.b

            // Scale
            scales[i] = Math.random()
        }

        return { positions, randomnessAttr, colors, scales }
    }, [count, radius, branches, randomness, randomnessPower, insideColor, outsideColor])

    useFrame((state) => {
        if (materialRef.current) {
            materialRef.current.uTime  = state.clock.getElapsedTime()
            materialRef.current.uSpeed = speed   // ← add these
            materialRef.current.uSize  = size * gl.getPixelRatio()
        }
        // if (orbitRef.current) {
        //     console.log(orbitRef.current)
        // }
    })

    useEffect(() => {
        if (!cameraRef.current) return
        cameraRef.current.lookAt(
            0.49699659887622355,
            -0.12877329814780017,
            0.7442729864478029
        )
    }, [])

    return (
        <>
            {/* <OrbitControls ref={orbitRef} makeDefault/> */}
            <PerspectiveCamera
                ref={cameraRef}
                makeDefault
                position={[
                    -0.0739597539304418,
                    -0.03767466985616738,
                    0.7890700237959908
                ]}
                fov={75}
                near={0.1}
                far={1000}
            />
            <points>
                <bufferGeometry>
                    <bufferAttribute attach="attributes-position"    args={[positions,      3]} />
                    <bufferAttribute attach="attributes-aRandomness" args={[randomnessAttr, 3]} />
                    <bufferAttribute attach="attributes-color"       args={[colors,         3]} />
                    <bufferAttribute attach="attributes-aScale"      args={[scales,         1]} />
                </bufferGeometry>

                <galaxyMaterial
                    ref={materialRef}
                    uSize={30 * gl.getPixelRatio()}
                    depthWrite={false}
                    blending={THREE.AdditiveBlending}
                    vertexColors
                />
            </points>
        </>
    )
}