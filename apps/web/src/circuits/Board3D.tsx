import { useEffect, useRef } from "react";
import { observeResize } from "../lib/observeResize";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RotateCcw } from "lucide-react";
import type { AnyCircuitElement } from "circuit-json";

function buildBoard(json: AnyCircuitElement[]) {
  const copper = new THREE.MeshStandardMaterial({
    color: "#c7a861",
    metalness: 0.7,
    roughness: 0.4,
    side: THREE.DoubleSide,
  });
  const group = new THREE.Group();
  const board = json.find((item) => item.type === "pcb_board");
  const width = board?.width ?? 40;
  const height = board?.height ?? 30;
  const x = board?.center.x ?? 0;
  const y = board?.center.y ?? 0;
  const thickness = board?.thickness ?? 1.6;
  const outline = board?.outline?.length
    ? board.outline
    : [
        { x: x - width / 2, y: y - height / 2 },
        { x: x + width / 2, y: y - height / 2 },
        { x: x + width / 2, y: y + height / 2 },
        { x: x - width / 2, y: y + height / 2 },
      ];
  const shape = new THREE.Shape(outline.map((point) => new THREE.Vector2(point.x, point.y)));
  for (const hole of json) {
    if (hole.type !== "pcb_hole" && hole.type !== "pcb_plated_hole") continue;
    const diameter = "hole_diameter" in hole ? hole.hole_diameter : 0;
    if (typeof diameter !== "number" || diameter <= 0) continue;
    const path = new THREE.Path();
    path.absarc(hole.x, hole.y, diameter / 2, 0, Math.PI * 2, true);
    shape.holes.push(path);
  }
  const boardMesh = new THREE.Mesh(
    new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false, curveSegments: 20 }),
    [
      new THREE.MeshStandardMaterial({ color: "#126544", roughness: 0.65 }),
      new THREE.MeshStandardMaterial({ color: "#b9ad87", roughness: 0.85 }),
    ],
  );
  boardMesh.position.z = -thickness / 2;
  group.add(boardMesh);
  const top = thickness / 2 + 0.025;
  const addPad = (
    geometry: THREE.BufferGeometry,
    px: number,
    py: number,
    z: number,
    rotation = 0,
  ) => {
    const mesh = new THREE.Mesh(geometry, copper);
    mesh.position.set(px, py, z);
    mesh.rotation.z = THREE.MathUtils.degToRad(rotation);
    group.add(mesh);
  };
  for (const item of json) {
    if (item.type === "pcb_smtpad") {
      const z = item.layer === "bottom" ? -top : top;
      if (item.shape === "circle") {
        addPad(new THREE.CircleGeometry(item.radius, 24), item.x, item.y, z);
      } else if ("width" in item && "height" in item) {
        addPad(
          new THREE.PlaneGeometry(item.width, item.height),
          item.x,
          item.y,
          z,
          "ccw_rotation" in item ? item.ccw_rotation : 0,
        );
      }
    } else if (item.type === "pcb_plated_hole" && item.shape === "circle") {
      for (const z of [top, -top])
        addPad(
          new THREE.RingGeometry(item.hole_diameter / 2, item.outer_diameter / 2, 24),
          item.x,
          item.y,
          z,
        );
    } else if (item.type === "pcb_trace") {
      let previous: THREE.Vector3 | null = null;
      for (const point of item.route) {
        if (point.route_type !== "wire") {
          previous = null;
          continue;
        }
        const next = new THREE.Vector3(point.x, point.y, point.layer === "bottom" ? -top : top);
        if (previous && previous.z === next.z && previous.distanceTo(next) > 0) {
          const direction = next.clone().sub(previous);
          const trace = new THREE.Mesh(
            new THREE.CylinderGeometry(point.width / 2, point.width / 2, direction.length(), 6),
            copper,
          );
          trace.position.copy(previous).add(next).multiplyScalar(0.5);
          trace.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
          group.add(trace);
        }
        previous = next;
      }
    } else if (item.type === "pcb_component") {
      const source = json.find(
        (candidate) =>
          candidate.type === "source_component" &&
          candidate.source_component_id === item.source_component_id,
      );
      const type = source?.type === "source_component" ? source.ftype : "";
      const componentHeight = type.includes("pin_header") || type.includes("connector") ? 3 : 0.8;
      const material = new THREE.MeshStandardMaterial({
        color: type.includes("led")
          ? "#a0d99f"
          : type.includes("capacitor")
            ? "#b59870"
            : "#303638",
        roughness: 0.6,
      });
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(
          Math.max(item.width * 0.65, 0.5),
          Math.max(item.height * 0.65, 0.5),
          componentHeight,
        ),
        material,
      );
      mesh.position.set(
        item.center.x,
        item.center.y,
        (item.layer === "bottom" ? -1 : 1) * (top + componentHeight / 2),
      );
      mesh.rotation.z = THREE.MathUtils.degToRad(item.rotation);
      group.add(mesh);
    }
  }
  return { group, width, height, x, y };
}

export function Board3D({
  circuitJson,
}: {
  circuitJson: AnyCircuitElement[];
  autoRotateDisabled?: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const reset = useRef<() => void>(() => {});

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- Own and dispose the WebGL scene, controls, GPU resources, and container resize observer.
  useEffect(() => {
    if (!host.current) return;
    const container = host.current;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor("#eef2ed");
    renderer.domElement.setAttribute("aria-label", "3D circuit board canvas");
    container.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const board = buildBoard(circuitJson);
    scene.add(board.group);
    scene.add(new THREE.HemisphereLight("#ffffff", "#666854", 3));
    const light = new THREE.DirectionalLight("#ffffff", 3);
    light.position.set(10, -20, 40);
    scene.add(light);
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 10000);
    camera.up.set(0, 0, 1);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = false;
    controls.minDistance = 2;
    controls.maxDistance = Math.max(board.width, board.height) * 15;
    const render = () => renderer.render(scene, camera);
    const fit = () => {
      const size = Math.max(board.width, board.height, 5);
      controls.target.set(board.x, board.y, 0);
      camera.position.set(board.x + size * 0.8, board.y - size, size * 1.3);
      camera.lookAt(controls.target);
      controls.update();
      render();
    };
    reset.current = fit;
    controls.addEventListener("change", render);
    const stopObserving = observeResize(container, () => {
      const { width, height } = container.getBoundingClientRect();
      if (!width || !height) return;
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      render();
    });
    fit();
    return () => {
      stopObserving();
      controls.dispose();
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          for (const material of Array.isArray(object.material)
            ? object.material
            : [object.material])
            material.dispose();
        }
      });
      renderer.dispose();
      renderer.domElement.remove();
      reset.current = () => {};
    };
  }, [circuitJson]);

  return (
    <div className="tsci-board3d">
      <div className="tsci-board3d-host" ref={host} />
      <span className="tsci-board3d-note">Generic component models · dimensions in mm</span>
      <button
        type="button"
        className="tsci-icon-button tsci-board3d-reset"
        onClick={() => reset.current()}
        aria-label="Reset 3D camera"
      >
        <RotateCcw size={15} />
      </button>
    </div>
  );
}
