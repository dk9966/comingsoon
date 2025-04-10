import * as dat from 'dat.gui';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js';
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

let camera, stats;
let composer, renderer, clock;
let scene, textMesh;

let doFlicker = true;

const params = {
    threshold: 0.18,
    strength: 0.9,
    radius: 0.8,
    textDepth: 0.2,
    exposure: 0.84,
    baseExposure: 0.84,  // Store the base exposure value
    color: 0x00ffff,

    colorCycleSpeed: 0.001,
    flickerSpeed: 0.003,
    flickerIntensity: 0.3,
    flickerDuration: 0.7  // Duration of each flicker in seconds
};

let hue = 0;
let flickerTime = 0;
let isFlickering = false;
let flickerEndTime = 0;

init();

async function init() {
    const container = document.getElementById('container');
    clock = new THREE.Clock();

    // Scene setup
    scene = new THREE.Scene();

    // Camera setup
    camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 1, 100);
    camera.position.set(0, 0, 25);

    scene.add(camera);

    // Lighting
    scene.add(new THREE.AmbientLight(0x404040));
    const pointLight = new THREE.PointLight(0xffffff, 80);
    camera.add(pointLight);

    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.toneMapping = THREE.ReinhardToneMapping;
    container.appendChild(renderer.domElement);

    // Load font and create text
    const fontLoader = new FontLoader();
    let savedFont = null; // Store the font for reuse

    fontLoader.load('/fonts/cyberalert.json', function (font) {
        savedFont = font; // Save the font
        createText(font, params.textDepth);
    });

    // Post-processing
    const renderScene = new RenderPass(scene, camera);

    const bloomPass = new UnrealBloomPass(
        new THREE.Vector2(window.innerWidth, window.innerHeight),
        params.strength,
        params.radius,
        params.threshold
    );

    const outputPass = new OutputPass();

    composer = new EffectComposer(renderer);
    composer.addPass(renderScene);
    composer.addPass(bloomPass);
    composer.addPass(outputPass);

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.minDistance = 5;
    controls.maxDistance = 40;

    // GUI
    const gui = new dat.GUI();
    gui.hide();  // Hide the GUI by default

    const bloomFolder = gui.addFolder('Bloom');
    bloomFolder.add(params, 'threshold', 0.0, 1.0).step(0.001).onChange(function (value) {
        bloomPass.threshold = Number(value);
    });

    bloomFolder.add(params, 'strength', 0.0, 3.0).onChange(function (value) {
        bloomPass.strength = Number(value);
    });

    bloomFolder.add(params, 'radius', 0.0, 1.0).step(0.01).onChange(function (value) {
        bloomPass.radius = Number(value);
    });

    const textFolder = gui.addFolder('Text');
    textFolder.add(params, 'textDepth', 0.001, 1.0).onChange(function (value) {
        // We need to recreate the text with new depth
        if (textMesh && savedFont) {
            scene.remove(textMesh);
            createText(savedFont, value);
        }
    });
    textFolder.open();

    const toneMappingFolder = gui.addFolder('Tone Mapping');
    toneMappingFolder.add(params, 'baseExposure', 0.1, 2)
        .name('Base Exposure')
        .onChange(function (value) {
            params.baseExposure = value;
            if (!isFlickering) {
                renderer.toneMappingExposure = Math.pow(value, 4.0);
            }
        });

    const colorFolder = gui.addFolder('Color Animation');
    colorFolder.add(params, 'colorCycleSpeed', 0.0001, 0.01)
        .name('Cycle Speed')
        .step(0.0001);
    colorFolder.open();

    const effectsFolder = gui.addFolder('Effects');
    effectsFolder.add(params, 'flickerSpeed', 0, 0.05)
        .name('Flicker Rate')
        .step(0.001);
    effectsFolder.add(params, 'flickerIntensity', 0, 1)
        .name('Flicker Intensity')
        .step(0.01);
    effectsFolder.add(params, 'flickerDuration', 0.1, 1)
        .name('Flicker Duration')
        .step(0.1);
    effectsFolder.open();

    // Make folders open by default
    bloomFolder.open();
    toneMappingFolder.open();

    // Window resize handler
    window.addEventListener('resize', onWindowResize);

    // Start animation loop
    renderer.setAnimationLoop(animate);
}

function onWindowResize() {
    const width = window.innerWidth;
    const height = window.innerHeight;

    camera.aspect = width / height;
    camera.updateProjectionMatrix();

    renderer.setSize(width, height);
    composer.setSize(width, height);
}

function animate() {
    const delta = clock.getDelta();

    // Update color
    if (textMesh) {
        hue = (hue + params.colorCycleSpeed) % 1;
        const color = new THREE.Color();
        color.setHSL(hue, 1, 0.7);

        // Add flicker effect
        if (doFlicker) {
            flickerTime += delta;

            // Check if we should start a new flicker
            if (!isFlickering && Math.random() < params.flickerSpeed) {
                isFlickering = true;
                flickerEndTime = flickerTime + params.flickerDuration;
            }

            // Update flicker state
            if (isFlickering) {
                if (flickerTime < flickerEndTime) {
                    // During flicker
                    const flicker = Math.random() * params.flickerIntensity;
                    const newExposure = params.baseExposure * (0.5 + flicker); // Vary exposure between 50% and 150% of base
                    renderer.toneMappingExposure = Math.pow(newExposure, 4.0);
                } else {
                    // End flicker
                    isFlickering = false;
                    renderer.toneMappingExposure = Math.pow(params.baseExposure, 4.0);
                }
            }
        }

        textMesh.material.color = color;
    }

    composer.render();
}

function createText(font, depth) {
    console.log("Creating text geometry with height parameter:", depth);
    const textGeometry = new TextGeometry('Coming Soon', {
        font: font,
        size: 1.5,  // Adjusted size for the new font
        depth: depth,
        curveSegments: 16,  // Increased for smoother curves
        bevelEnabled: true,
        bevelThickness: 0.02,  // Adjusted for sharper edges
        bevelSize: 0.01,      // Adjusted for sharper edges
        bevelOffset: 0,
        bevelSegments: 8     // Increased for smoother bevels
    });

    textGeometry.computeBoundingBox();
    const actualDepth = textGeometry.boundingBox.max.z - textGeometry.boundingBox.min.z;
    console.log("Text depth (z-dimension):", actualDepth);
    console.log("Text bounding box:",
        "min:", textGeometry.boundingBox.min.toArray(),
        "max:", textGeometry.boundingBox.max.toArray());

    // Calculate center offset for both x and y
    const textWidth = textGeometry.boundingBox.max.x - textGeometry.boundingBox.min.x;
    const textHeight = textGeometry.boundingBox.max.y - textGeometry.boundingBox.min.y;
    const textDepth = textGeometry.boundingBox.max.z - textGeometry.boundingBox.min.z;

    // Center the text in all dimensions
    const centerOffsetX = -0.5 * textWidth;
    const centerOffsetY = -0.5 * textHeight;
    const centerOffsetZ = -0.5 * textDepth;

    // Create edges geometry for outline
    const edges = new THREE.EdgesGeometry(textGeometry);
    const lineMaterial = new THREE.LineBasicMaterial({
        color: params.color,
        transparent: true,  // Enable transparency
        opacity: 1,        // Start fully opaque
        linewidth: 1
    });

    textMesh = new THREE.LineSegments(edges, lineMaterial);

    // Position text at the center of the scene
    textMesh.position.set(centerOffsetX, centerOffsetY, centerOffsetZ);

    // Slight tilt for better viewing angle
    textMesh.rotation.x = 0.1;

    scene.add(textMesh);
} 