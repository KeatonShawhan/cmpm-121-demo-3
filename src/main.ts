import leaflet from "leaflet";
import "leaflet/dist/leaflet.css";
import "./style.css";
import "./leafletWorkaround.ts";
import luck from "./luck.ts";
import { Board } from "./board.ts";

const OAKES_CLASSROOM = leaflet.latLng(36.98949379578401, -122.06277128548504);
const TILE_DEGREES = 0.0001;
const NEIGHBORHOOD_SIZE = 8;
const CACHE_SPAWN_PROBABILITY = 0.05;
const GAMEPLAY_ZOOM_LEVEL = 19;
const board = new Board(TILE_DEGREES, NEIGHBORHOOD_SIZE);

export class Cell {
  i: number;
  j: number;

  constructor(i: number, j: number) {
    this.i = i;
    this.j = j;
  }
}

let playerTile = new Cell(0, 0);

interface Memento<T> {
  toMemento(): T;
  fromMemento(memento: T): void;
}

class Coin {
  constructor(public i: number, public j: number, public serial: number) {}
}

// NEW: MapService class to encapsulate map interactions
class MapService {
  private map: leaflet.Map;

  constructor(map: leaflet.Map) {
    this.map = map;
  }

  addLayer(layer: leaflet.Layer): void {
    this.map.addLayer(layer);
  }

  removeLayer(layer: leaflet.Layer): void {
    this.map.removeLayer(layer);
  }

  panTo(position: leaflet.LatLng): void {
    this.map.panTo(position);
  }

  getVisibleBounds(): leaflet.LatLngBounds {
    return this.map.getBounds();
  }

  setView(center: leaflet.LatLng, zoom: number): void {
    this.map.setView(center, zoom);
  }

  // Additional methods can be added as needed
}

// Updated CacheView class to use MapService
class CacheView {
  private rect: leaflet.Rectangle;
  private mapService: MapService;

  constructor(rect: leaflet.Rectangle, mapService: MapService) {
    this.rect = rect;
    this.mapService = mapService;
  }

  setVisible(isVisible: boolean) {
    if (isVisible) {
      this.mapService.addLayer(this.rect); // Use MapService
    } else {
      this.mapService.removeLayer(this.rect); // Use MapService
    }
  }

  bindPopup(
    popupContent:
      | string
      | HTMLElement
      | ((layer: leaflet.Layer) => string | HTMLElement),
  ) {
    this.rect.bindPopup(popupContent);
  }

  getBounds(): leaflet.LatLngBounds {
    return this.rect.getBounds();
  }

  removeFromMap() {
    this.mapService.removeLayer(this.rect); // Use MapService
  }

  getRect(): leaflet.Rectangle {
    return this.rect;
  }
}

class Cache implements Memento<string> {
  i: number;
  j: number;
  cacheCoinsArray: Coin[];
  private view: CacheView;

  constructor(i: number, j: number, initialCoins: Coin[], view: CacheView) {
    this.i = i;
    this.j = j;
    this.cacheCoinsArray = initialCoins;
    this.view = view;
  }

  toMemento(): string {
    return JSON.stringify(this.cacheCoinsArray);
  }

  fromMemento(memento: string): void {
    this.cacheCoinsArray = JSON.parse(memento);
  }

  getView(): CacheView {
    return this.view;
  }
}

const cacheStorage: Map<string, string> = new Map();
const cacheMap: Map<string, Cache> = new Map();

// Initialize the map instance
const mapInstance = leaflet.map("map", {
  center: OAKES_CLASSROOM,
  zoom: GAMEPLAY_ZOOM_LEVEL,
  minZoom: GAMEPLAY_ZOOM_LEVEL,
  maxZoom: GAMEPLAY_ZOOM_LEVEL,
  zoomControl: false,
  scrollWheelZoom: false,
});

// Add tile layer to the map instance
leaflet
  .tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution:
      '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  })
  .addTo(mapInstance);

// Create the MapService
const mapService = new MapService(mapInstance);

const playerPath: leaflet.LatLng[] = [];
const playerPolyline = leaflet
  .polyline(playerPath, {
    color: "blue",
    weight: 5,
  })
  .addTo(mapInstance);

const playerMarker = leaflet
  .marker(OAKES_CLASSROOM)
  .bindTooltip("You are here!")
  .addTo(mapInstance);

const INTERACTION_RADIUS = 10;

let playerCoins = 0;
let playerPosition = OAKES_CLASSROOM;
const collectedCoins: Coin[] = [];

let geolocationWatchId: number | null = null;

function toggleGeolocationTracking() {
  const button = document.getElementById(
    "toggleGeolocation",
  ) as HTMLButtonElement;
  if (geolocationWatchId !== null) {
    navigator.geolocation.clearWatch(geolocationWatchId);
    geolocationWatchId = null;
    button.style.background = "#3a3a3a";
    updatePlayerPosition(36.98949379578401, -122.06277128548504);
    regenerateCachesAroundPlayer();
  } else {
    geolocationWatchId = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        updatePlayerPosition(latitude, longitude);
        regenerateCachesAroundPlayer();
      },
      (error) => {
        console.error("Geolocation error:", error);
        alert("Unable to access your location.");
      },
      {
        enableHighAccuracy: true,
      },
    );
    button.style.background = "white";
  }
}

function updatePlayerPosition(lat: number, lng: number) {
  playerMarker.setLatLng([lat, lng]);
  mapService.panTo(leaflet.latLng(lat, lng)); // Use MapService
  playerPosition = leaflet.latLng(lat, lng);

  const newPlayerTile = board.getCellForPoint(playerPosition);
  playerTile = newPlayerTile;

  playerPath.push(playerPosition);
  playerPolyline.setLatLngs(playerPath);

  cacheVisibility();
  saveGameData();
  regenerateCachesAroundPlayer();
}

const toggleGeolocationButton = document.getElementById("toggleGeolocation")!;
toggleGeolocationButton.addEventListener("click", toggleGeolocationTracking);

function spawnCache(i: number, j: number) {
  const cacheKey = `${i},${j}`;
  const cacheCell = new Cell(i, j);
  const canonicalCell = board.getCanonicalCell(cacheCell);
  if (cacheStorage.has(cacheKey)) {
    return;
  }
  const cacheLocation = board.getCellBounds(canonicalCell).getCenter();

  const cacheCoins = Math.floor(
    luck([i, j, "initialValue"].toString()) * 10,
  );

  const rect = leaflet.rectangle(board.getCellBounds(canonicalCell), {
    color: "#ff4081",
    weight: 3,
    fillColor: "#ff4081",
    fillOpacity: 0.4,
  });

  const cacheView = new CacheView(rect, mapService); // Pass mapService
  const cacheCoinsArray: Coin[] = [];
  for (let serial = 0; serial < cacheCoins; serial++) {
    const coin = new Coin(canonicalCell.i, canonicalCell.j, serial);
    cacheCoinsArray.push(coin);
  }

  const cache = new Cache(
    canonicalCell.i,
    canonicalCell.j,
    cacheCoinsArray,
    cacheView,
  );
  cacheStorage.set(cacheKey, cache.toMemento());
  cacheMap.set(`${i},${j}`, cache);

  setupCachePopup(cache, cacheKey, cacheLocation);
}

function setupCachePopup(
  cache: Cache,
  cacheKey: string,
  cacheLocation: leaflet.LatLng,
) {
  cache.getView().bindPopup(() => {
    const loadedCache = restoreCache(cacheKey);
    if (!loadedCache) return `<div>Cache not found.</div>`;

    if (playerPosition.distanceTo(cacheLocation) > INTERACTION_RADIUS) {
      return `<div>You need to be closer to interact with this cache.</div>`;
    }

    const popupDiv = document.createElement("div");

    const coinList = loadedCache.cacheCoinsArray
      .map((coin) => {
        return `<li>Coin: ${coin.i}:${coin.j}#${coin.serial}</li>`;
      })
      .join("");

    popupDiv.innerHTML = `
      <div>Cache location: ${cache.i},${cache.j}</div>
      <div>Coins in cache:</div>
      <ul>${coinList}</ul>
      <button id="collect" style="color: white;">Collect</button>
      <button id="deposit" style="color: white;">Deposit</button>
    `;

    popupDiv
      .querySelector<HTMLButtonElement>("#collect")!
      .addEventListener("click", () => {
        if (loadedCache.cacheCoinsArray.length > 0) {
          const collectedCoin = loadedCache.cacheCoinsArray.shift();
          if (collectedCoin) {
            collectedCoins.push(collectedCoin);
            playerCoins++;
            statusPanel.innerHTML = `Player coins: ${playerCoins}`;
            cacheStorage.set(cacheKey, loadedCache.toMemento());

            // Update coin list in popup
            popupDiv.querySelector("ul")!.innerHTML = loadedCache
              .cacheCoinsArray
              .map(
                (coin) => `<li>Coin: ${coin.i}:${coin.j}#${coin.serial}</li>`,
              )
              .join("");
            saveGameData();
          }
        } else {
          alert("No more coins to collect at this cache.");
        }
      });

    popupDiv
      .querySelector<HTMLButtonElement>("#deposit")!
      .addEventListener("click", () => {
        if (collectedCoins.length > 0) {
          const depoCoin = collectedCoins.pop();
          if (depoCoin) {
            loadedCache.cacheCoinsArray.push(depoCoin);
            playerCoins--;
            statusPanel.innerHTML = `Player coins: ${playerCoins}`;
            cacheStorage.set(cacheKey, loadedCache.toMemento());

            popupDiv.querySelector("ul")!.innerHTML = loadedCache
              .cacheCoinsArray
              .map(
                (coin) => `<li>Coin: ${coin.i}:${coin.j}#${coin.serial}</li>`,
              )
              .join("");
            saveGameData();
          } else {
            alert("No coins in your inventory to deposit.");
          }
        } else {
          alert("No coins in your inventory to deposit.");
        }
      });

    return popupDiv;
  });
}

function restoreCache(cacheKey: string): Cache | null {
  if (!cacheStorage.has(cacheKey)) return null;

  const cacheMemento = cacheStorage.get(cacheKey)!;
  const [i, j] = cacheKey.split(",").map(Number);

  // Recreate the rect and CacheView
  const cacheCell = new Cell(i, j);
  const rect = leaflet.rectangle(board.getCellBounds(cacheCell), {
    color: "#ff4081",
    weight: 3,
    fillColor: "#ff4081",
    fillOpacity: 0.4,
  });
  const cacheView = new CacheView(rect, mapService);

  const cache = new Cache(i, j, [], cacheView);
  cache.fromMemento(cacheMemento);
  return cache;
}

function cacheVisibility() {
  const nearbyCells = board.getCellsNearPoint(playerPosition);
  cacheMap.forEach((cache, key) => {
    const [cacheI, cacheJ] = key.split(",").map(Number);
    const cacheCell = new Cell(cacheI, cacheJ);
    const isVisible = nearbyCells.includes(
      board.getCanonicalCell(cacheCell),
    );
    cache.getView().setVisible(isVisible);
  });
}

const statusPanel = document.querySelector<HTMLDivElement>("#statusPanel")!;
statusPanel.innerHTML = `Player coins: ${playerCoins}`;

for (let i = -NEIGHBORHOOD_SIZE; i < NEIGHBORHOOD_SIZE; i++) {
  for (let j = -NEIGHBORHOOD_SIZE; j < NEIGHBORHOOD_SIZE; j++) {
    if (luck([i, j].toString()) < CACHE_SPAWN_PROBABILITY) {
      spawnCache(i, j);
    }
  }
}

function regenerateCachesAroundPlayer() {
  const nearbyCells = board.getCellsNearPoint(playerPosition);
  nearbyCells.forEach((cell) => {
    const cacheKey = `${cell.i},${cell.j}`;
    if (
      !cacheStorage.has(cacheKey) &&
      luck([cell.i, cell.j].toString()) < CACHE_SPAWN_PROBABILITY
    ) {
      spawnCache(cell.i, cell.j);
    }
  });
}

const controls = document.getElementById("controlPanel")!;
controls.addEventListener("click", (event) => {
  const direction = (event.target as HTMLElement).id;
  if (["north", "south", "west", "east"].includes(direction)) {
    movePlayer(direction as "north" | "south" | "west" | "east");
  } else if (direction === "reset") {
    resetGame();
  }
  regenerateCachesAroundPlayer();
  saveGameData();
});

function movePlayer(direction: "north" | "south" | "west" | "east") {
  let { lat, lng } = playerMarker.getLatLng();
  if (direction === "north") {
    lat += TILE_DEGREES;
    playerTile.i += 1;
  }
  if (direction === "south") {
    lat -= TILE_DEGREES;
    playerTile.i -= 1;
  }
  if (direction === "east") {
    lng += TILE_DEGREES;
    playerTile.j += 1;
  }
  if (direction === "west") {
    lng -= TILE_DEGREES;
    playerTile.j -= 1;
  }
  cacheVisibility();
  playerMarker.setLatLng([lat, lng]);
  mapService.panTo(leaflet.latLng(lat, lng)); // Use MapService
  playerPosition = leaflet.latLng(lat, lng);
  playerPath.push(playerPosition);
  playerPolyline.setLatLngs(playerPath);
  saveGameData();
}

function saveGameData() {
  localStorage.setItem(
    "playerPosition",
    JSON.stringify({
      lat: playerPosition.lat,
      lng: playerPosition.lng,
    }),
  );

  localStorage.setItem(
    "playerTile",
    JSON.stringify({
      i: playerTile.i,
      j: playerTile.j,
    }),
  );

  localStorage.setItem("playerCoins", JSON.stringify(playerCoins));

  localStorage.setItem("collectedCoins", JSON.stringify(collectedCoins));

  localStorage.setItem(
    "playerPath",
    JSON.stringify(
      playerPath.map((point) => ({
        lat: point.lat,
        lng: point.lng,
      })),
    ),
  );

  const cacheData = Object.fromEntries(cacheStorage);
  localStorage.setItem("cacheData", JSON.stringify(cacheData));
}

function loadGameData() {
  const savedPosition = localStorage.getItem("playerPosition");
  if (savedPosition) {
    const { lat, lng } = JSON.parse(savedPosition);
    playerPosition = leaflet.latLng(lat, lng);
    playerMarker.setLatLng(playerPosition);
    mapService.panTo(playerPosition); // Use MapService
  }

  const savedTile = localStorage.getItem("playerTile");
  if (savedTile) {
    const { i, j } = JSON.parse(savedTile);
    playerTile = new Cell(i, j);
  }

  const savedCoins = localStorage.getItem("playerCoins");
  if (savedCoins) {
    playerCoins = JSON.parse(savedCoins);
    statusPanel.innerHTML = `Player coins: ${playerCoins}`;
  }

  const savedCollectedCoins = localStorage.getItem("collectedCoins");
  if (savedCollectedCoins) {
    collectedCoins.length = 0;
    collectedCoins.push(...JSON.parse(savedCollectedCoins));
  }

  const savedPlayerPath = localStorage.getItem("playerPath");
  if (savedPlayerPath) {
    const parsedPath = JSON.parse(savedPlayerPath);
    const latLngPath = parsedPath.map((point: { lat: number; lng: number }) =>
      leaflet.latLng(point.lat, point.lng)
    );
    playerPath.push(...latLngPath);
    playerPolyline.setLatLngs(playerPath);
  }

  const savedCacheData = localStorage.getItem("cacheData");
  if (savedCacheData) {
    const caches = JSON.parse(savedCacheData);
    Object.entries(caches).forEach(([key, coins]) => {
      const [i, j] = key.split(",").map(Number);

      const cacheCell = new Cell(i, j);
      const rect = leaflet.rectangle(board.getCellBounds(cacheCell), {
        color: "#ff4081",
        weight: 3,
        fillColor: "#ff4081",
        fillOpacity: 0.4,
      });

      const cacheView = new CacheView(rect, mapService);
      const cache = new Cache(i, j, [], cacheView);
      cache.fromMemento(coins as string);
      cacheMap.set(key, cache);
      cacheStorage.set(key, coins as string);

      // Set visibility
      const nearbyCells = board.getCellsNearPoint(playerPosition);
      const isVisible = nearbyCells.includes(
        board.getCanonicalCell(cacheCell),
      );
      cache.getView().setVisible(isVisible);

      setupCachePopup(cache, key, board.getCellBounds(cacheCell).getCenter());
    });
  }
}

function resetGame() {
  cacheMap.forEach((cache) => {
    cache.getView().setVisible(false);
  });
  playerCoins = 0;
  playerMarker.setLatLng(OAKES_CLASSROOM);
  playerPosition = leaflet.latLng(
    36.98949379578401,
    -122.06277128548504,
  );
  mapService.setView(OAKES_CLASSROOM, GAMEPLAY_ZOOM_LEVEL); // Use MapService
  statusPanel.innerHTML = `Coins: ${playerCoins}`;

  if (geolocationWatchId !== null) {
    toggleGeolocationTracking();
  }
  playerPath.length = 0;
  playerPolyline.setLatLngs([]);

  playerTile.i = 0;
  playerTile.j = 0;
  collectedCoins.length = 0;

  cacheMap.forEach((cache) => {
    cache.getView().removeFromMap();
  });

  cacheMap.clear();
  cacheStorage.clear();
  localStorage.clear();
  regenerateCachesAroundPlayer();
  cacheVisibility();
}

document.addEventListener("DOMContentLoaded", () => {
  loadGameData();
  regenerateCachesAroundPlayer();
});
