import { useGLTF, OrbitControls } from '@react-three/drei'
import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useControls } from 'leva'
import * as THREE from 'three'

const Mars = () => {
  const mars = useGLTF('./Mars/scene.gltf')

  const { material } = useControls({
  material: {
    options: ['texture', 'wireframe', 'wireframe-red'],
    value: 'texture',
  },
  })
  useEffect(() => {
    if (material === "wireframe") {
      mars.scene.traverse((child) => {
        if (child.isMesh) {
          child.material.wireframe = true
        }
      })
    }
    else if (material === "wireframe-red") {
      mars.scene.traverse((child) => {
        if (child.isMesh) {
          child.material = new THREE.MeshBasicMaterial({ color: 0xff4400, wireframe: true })
        }
      })
    }
  }, [material])
  return (
    <primitive
      object={mars.scene}
      scale={3}
      position={[0, 0, 0]}
      rotation-x={-0.5}
      rotation-y={-0.6}
      rotation-z={0}
    />
  )
}

export default function Terrain({ mousePosition }) {
  const controlsRef = useRef()
  const { camera, gl } = useThree()

  const rawT          = useRef(0.5)
  const smoothedT     = useRef(0.5)
  const rawTiltY      = useRef(0)
  const smoothedTiltY = useRef(0)

  const {
    startX, startY, startZ,
    startTargetX, startTargetY, startTargetZ,
    finishX, finishY, finishZ,
    finishTargetX, finishTargetY, finishTargetZ,
    lerpAmount, useLeva,
    easeSpeed, tiltStrength,
    maxStepPerFrame,
    mouseXMin, mouseXMax,
    mouseYMin, mouseYMax,
    maxAzimuth, minAzimuth,
    maxPolar, minPolar,
  } = useControls({
    startX:        { value: 25.77, min: -50, max: 50, render: () => false},
    startY:        { value: 4.40,  min: -50, max: 50, render: () => false},
    startZ:        { value: -16.60,min: -50, max: 50, render: () => false},
    startTargetX:  { value: 23,    min: -50, max: 50, render: () => false},
    startTargetY:  { value: 0,     min: -50, max: 50, render: () => false},
    startTargetZ:  { value: -24,   min: -50, max: 50, render: () => false},
    finishX:       { value: -5.27, min: -50, max: 50, render: () => false},
    finishY:       { value: 7.77,  min: -50, max: 50, render: () => false},
    finishZ:       { value: -0.02, min: -50, max: 50, render: () => false},
    finishTargetX: { value: -8,    min: -50, max: 50, render: () => false},
    finishTargetY: { value: 5,     min: -50, max: 50, render: () => false},
    finishTargetZ: { value: -10,   min: -50, max: 50, render: () => false},
    lerpAmount:      { value: 0.5,   min: 0,      max: 1,    step: 0.01  , render: () => false},
    useLeva:         { value: false, label: 'use leva lerp', render: () => false},
    easeSpeed:       { value: 0.018, min: 0.003,  max: 0.12, step: 0.001 },
    // Max distance rawT can travel per frame — this is your true speed limit
    maxStepPerFrame: { value: 0.0008, min: 0.0005, max: 0.02, step: 0.0005 },
    tiltStrength:    { value: 1.5,   min: 0,      max: 5,    step: 0.1  },
    mouseXMin: { value: 0.15, min: 0,   max: 0.5, step: 0.01, render: () => false},
    mouseXMax: { value: 0.85, min: 0.5, max: 1,   step: 0.01, render: () => false},
    mouseYMin: { value: 0.2,  min: 0,   max: 0.5, step: 0.01, render: () => false},
    mouseYMax: { value: 0.8,  min: 0.5, max: 1,   step: 0.01, render: () => false},
    minAzimuth: { value: -Math.PI / 4, min: -Math.PI, max: Math.PI, render: () => false},
    maxAzimuth: { value:  Math.PI / 4, min: -Math.PI, max: Math.PI, render: () => false},
    minPolar:   { value:  Math.PI / 4, min: 0, max: Math.PI, render: () => false},
    maxPolar:   { value:  Math.PI / 2, min: 0, max: Math.PI, render: () => false},
  })

  const startPos     = new THREE.Vector3(startX, startY, startZ)
  const startTarget  = new THREE.Vector3(startTargetX, startTargetY, startTargetZ)
  const finishPos    = new THREE.Vector3(finishX, finishY, finishZ)
  const finishTarget = new THREE.Vector3(finishTargetX, finishTargetY, finishTargetZ)

  useFrame(() => {
    if (!controlsRef.current) return

    if (useLeva) {
      rawT.current          = lerpAmount
      smoothedT.current     = lerpAmount
      rawTiltY.current      = 0
      smoothedTiltY.current = 0
    } else {
      const mx = mousePosition?.x ?? 0.5
      const my = mousePosition?.y ?? 0.5

      const remappedX = THREE.MathUtils.clamp(
        (mx - mouseXMin) / (mouseXMax - mouseXMin), 0, 1
      )
      const remappedY = THREE.MathUtils.clamp(
        (my - mouseYMin) / (mouseYMax - mouseYMin), 0, 1
      )

      // Stage 1: velocity-capped approach — big mouse jumps can't cause big camera jumps
      const deltaT    = remappedX - rawT.current
      const deltaTilt = (0.5 - remappedY) * 2 - rawTiltY.current
      rawT.current     += Math.sign(deltaT)    * Math.min(Math.abs(deltaT),    maxStepPerFrame)
      rawTiltY.current += Math.sign(deltaTilt) * Math.min(Math.abs(deltaTilt), maxStepPerFrame * 10)

      // Stage 2: smoothed lerps toward the capped raw value (ease-in/out feel)
      smoothedT.current     += (rawT.current     - smoothedT.current)     * easeSpeed
      smoothedTiltY.current += (rawTiltY.current - smoothedTiltY.current) * easeSpeed
    }

    const t = smoothedT.current

    const cameraPos    = new THREE.Vector3().lerpVectors(startPos, finishPos, t)
    const cameraTarget = new THREE.Vector3().lerpVectors(startTarget, finishTarget, t)
    cameraTarget.y    += smoothedTiltY.current * tiltStrength

    camera.position.copy(cameraPos)
    controlsRef.current.target.copy(cameraTarget)

    const theta = controlsRef.current.getAzimuthalAngle()
    const phi   = controlsRef.current.getPolarAngle()
    controlsRef.current.setAzimuthalAngle(
      THREE.MathUtils.clamp(theta, minAzimuth, maxAzimuth)
    )
    controlsRef.current.setPolarAngle(
      THREE.MathUtils.clamp(phi, minPolar, maxPolar)
    )
    controlsRef.current.update()
  })

  return (
    <>
      <Mars />
      <OrbitControls
        ref={controlsRef}
        args={[camera, gl.domElement]}
        enableZoom={true}
        enablePan={true}
      />
    </>
  )
}