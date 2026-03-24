import { useGLTF, OrbitControls } from '@react-three/drei'
import { useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useControls } from 'leva'
import * as THREE from 'three'

const Mars = () => {
  const mars = useGLTF('./Mars/scene.gltf')
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

  // Smoothed interpolation state — lives outside render cycle
  const smoothedT = useRef(0.5)
  const smoothedTiltY = useRef(0)

  const {
    startX, startY, startZ,
    startTargetX, startTargetY, startTargetZ,
    finishX, finishY, finishZ,
    finishTargetX, finishTargetY, finishTargetZ,
    lerpAmount,
    useLeva,
    easeSpeed,
    tiltStrength,
    maxAzimuth, minAzimuth,
    maxPolar, minPolar,
  } = useControls({
    startX: { value: 25.77, min: -50, max: 50 },
    startY: { value: 4.40, min: -50, max: 50 },
    startZ: { value: -16.60, min: -50, max: 50 },
    startTargetX: { value: 23, min: -50, max: 50 },
    startTargetY: { value: 0, min: -50, max: 50 },
    startTargetZ: { value: -24, min: -50, max: 50 },
    finishX: { value: -5.27, min: -50, max: 50 },
    finishY: { value: 7.77, min: -50, max: 50 },
    finishZ: { value: -0.02, min: -50, max: 50 },
    finishTargetX: { value: -8, min: -50, max: 50 },
    finishTargetY: { value: 5, min: -50, max: 50 },
    finishTargetZ: { value: -10, min: -50, max: 50 },
    lerpAmount: { value: 0.5, min: 0, max: 1, step: 0.01 },
    useLeva: { value: false, label: 'use leva lerp' },
    // How fast the camera catches up to the mouse target (lower = lazier)
    easeSpeed: { value: 0.025, min: 0.005, max: 0.15, step: 0.005 },
    // How much mouse Y tilts the look target up/down
    tiltStrength: { value: 1.5, min: 0, max: 5, step: 0.1 },
    minAzimuth: { value: -Math.PI / 4, min: -Math.PI, max: Math.PI },
    maxAzimuth: { value: Math.PI / 4, min: -Math.PI, max: Math.PI },
    minPolar: { value: Math.PI / 4, min: 0, max: Math.PI },
    maxPolar: { value: Math.PI / 2, min: 0, max: Math.PI },
  })

  const startPos    = new THREE.Vector3(startX, startY, startZ)
  const startTarget = new THREE.Vector3(startTargetX, startTargetY, startTargetZ)
  const finishPos   = new THREE.Vector3(finishX, finishY, finishZ)
  const finishTarget = new THREE.Vector3(finishTargetX, finishTargetY, finishTargetZ)

  useFrame(() => {
    if (!controlsRef.current) return

    if (useLeva) {
      // Override: use the Leva slider directly, no smoothing
      smoothedT.current = lerpAmount
      smoothedTiltY.current = 0
    } else {
      // Mouse X (0–1) drives the pan, Y drives the tilt
      const mouseX = mousePosition?.x ?? 0.5   // 0 = left, 1 = right
      const mouseY = mousePosition?.y ?? 0.5   // 0 = top,  1 = bottom

      // Lazy ease: current value drifts toward mouse target each frame
      smoothedT.current += (mouseX - smoothedT.current) * easeSpeed

      // Tilt: map mouse Y from [0,1] → [-1,1], then scale
      const tiltTarget = (0.5 - mouseY) * 2   // positive = mouse up → look up
      smoothedTiltY.current += (tiltTarget - smoothedTiltY.current) * easeSpeed
    }

    const t = smoothedT.current

    // Pan position and base look target along the track
    const cameraPos   = new THREE.Vector3().lerpVectors(startPos, finishPos, t)
    const cameraTarget = new THREE.Vector3().lerpVectors(startTarget, finishTarget, t)

    // Add vertical tilt offset to look target (not camera position)
    cameraTarget.y += smoothedTiltY.current * tiltStrength

    camera.position.copy(cameraPos)
    controlsRef.current.target.copy(cameraTarget)

    // Clamp orbit angles
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