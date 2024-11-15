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
  constructor(
    public i: number,
    public j: number,
    public serial: number,
  ) {}
}

class Cache implements Memento<string> {
  i: number;
  j: number;
  cacheCoinsArray: Coin[];
  rect: leaflet.Rectangle;

  constructor(
    i: number,
    j: number,
    initialCoins: Coin[],
    rect: leaflet.Rectangle,
  ) {
    this.i = i;
    this.j = j;
    this.cacheCoinsArray = initialCoins;
    this.rect = rect;
  }

  toMemento(): string {
    return JSON.stringify(this.cacheCoinsArray);
  }

  fromMemento(memento: string): void {
    this.cacheCoinsArray = JSON.parse(memento);
  }

  setVisible(isVisible: boolean) {
    if (isVisible) {
      this.rect.addTo(map);
    } else {
      map.removeLayer(this.rect);
    }
  }
}

const cacheStorage: Map<string, string> = new Map();
const cacheMap: Map<string, Cache> = new Map();

const map = leaflet.map("map", {
  center: OAKES_CLASSROOM,
  zoom: GAMEPLAY_ZOOM_LEVEL,
  minZoom: GAMEPLAY_ZOOM_LEVEL,
  maxZoom: GAMEPLAY_ZOOM_LEVEL,
  zoomControl: false,
  scrollWheelZoom: false,
});

const playerPath: leaflet.LatLng[] = [];
const playerPolyline = leaflet.polyline(playerPath, {
  color: "blue",
  weight: 5,
}).addTo(map);

leaflet.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution:
    '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
}).addTo(map);

const playerMarker = leaflet.marker(OAKES_CLASSROOM).bindTooltip(
  "You are here!",
);
playerMarker.addTo(map);
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
  map.panTo([lat, lng]);
  playerPosition = leaflet.latLng(lat, lng);

  const newPlayerTile = board.getCellForPoint(playerPosition);
  playerTile = newPlayerTile;

  playerPath.push(playerPosition);
  playerPolyline.setLatLngs(playerPath);

  cacheVisibility();
  saveGameData();
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

  const cacheCoins = Math.floor(luck([i, j, "initialValue"].toString()) * 10);

  // const cacheColor = "#ff4081";

  const rect = leaflet.rectangle(
    board.getCellBounds(canonicalCell),
    { color: "#ff4081", weight: 3, fillColor: "#ff4081", fillOpacity: 0.4 },
  ).addTo(map);
  rect.addTo(map);

  const cacheCoinsArray: Coin[] = [];
  for (let serial = 0; serial < cacheCoins; serial++) {
    const coin = new Coin(canonicalCell.i, canonicalCell.j, serial);
    cacheCoinsArray.push(coin);
  }

  const cache = new Cache(
    canonicalCell.i,
    canonicalCell.j,
    cacheCoinsArray,
    rect,
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
  cache.rect.bindPopup(() => {
    const loadedCache = restoreCache(cacheKey);
    if (!loadedCache) return `<div>Cache not found.</div>`;

    if (playerPosition.distanceTo(cacheLocation) > INTERACTION_RADIUS) {
      return `<div>You need to be closer to interact with this cache.</div>`;
    }

    const popupDiv = document.createElement("div");

    const coinList = loadedCache.cacheCoinsArray.map((coin) => {
      return `<li>Coin: ${coin.i}:${coin.j}#${coin.serial}</li>`;
    }).join("");

    popupDiv.innerHTML = `
      <div>Cache location: ${cache.i},${cache.j}</div>
      <div>Coins in cache:</div>
      <ul>${coinList}</ul>
      <button id="collect" style="color: white;">Collect</button>
      <button id="deposit" style="color: white;">Deposit</button>
    `;

    popupDiv.querySelector<HTMLButtonElement>("#collect")!.addEventListener(
      "click",
      () => {
        if (loadedCache.cacheCoinsArray.length > 0) {
          const collectedCoin = loadedCache.cacheCoinsArray.shift();
          if (collectedCoin) {
            collectedCoins.push(collectedCoin);
            playerCoins++;
            statusPanel.innerHTML = `Player coins: ${playerCoins}`;
            cacheStorage.set(cacheKey, loadedCache.toMemento());

            // Update coin list in popup
            popupDiv.querySelector("ul")!.innerHTML = loadedCache
              .cacheCoinsArray.map(
                (coin) => `<li>Coin: ${coin.i}:${coin.j}#${coin.serial}</li>`,
              ).join("");
            saveGameData();
          }
        } else {
          alert("No more coins to collect at this cache.");
        }
      },
    );

    popupDiv.querySelector<HTMLButtonElement>("#deposit")!.addEventListener(
      "click",
      () => {
        if (collectedCoins.length > 0) {
          const depoCoin = collectedCoins.pop();
          if (depoCoin) {
            loadedCache.cacheCoinsArray.push(depoCoin);
            playerCoins--;
            statusPanel.innerHTML = `Player coins: ${playerCoins}`;
            cacheStorage.set(cacheKey, loadedCache.toMemento());

            popupDiv.querySelector("ul")!.innerHTML = loadedCache
              .cacheCoinsArray.map(
                (coin) => `<li>Coin: ${coin.i}:${coin.j}#${coin.serial}</li>`,
              ).join("");
            saveGameData();
          } else {
            alert("No coins in your inventory to deposit.");
          }
        } else {
          alert("No coins in your inventory to deposit.");
        }
      },
    );

    return popupDiv;
  });
}

function restoreCache(cacheKey: string): Cache | null {
  if (!cacheStorage.has(cacheKey)) return null;

  const cacheMemento = cacheStorage.get(cacheKey)!;
  const [i, j] = cacheKey.split(",").map(Number);
  const rect = leaflet.rectangle([[0, 0], [0, 0]]);
  const cache = new Cache(i, j, [], rect);
  cache.fromMemento(cacheMemento);
  return cache;
}

function cacheVisibility() {
  const nearbyCells = board.getCellsNearPoint(playerPosition);
  cacheMap.forEach((cache, key) => {
    const [cacheI, cacheJ] = key.split(",").map(Number);
    const cacheCell = new Cell(cacheI, cacheJ);
    const isVisible = nearbyCells.includes(board.getCanonicalCell(cacheCell));
    cache.setVisible(isVisible);
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
  map.panTo([lat, lng]);
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
    JSON.stringify(playerPath.map((point) => ({
      lat: point.lat,
      lng: point.lng,
    }))),
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
    map.panTo(playerPosition);
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
      const cacheLocation = board.getCellBounds(new Cell(i, j)).getCenter();
      const rect = leaflet.rectangle(board.getCellBounds(new Cell(i, j)), {
        color: "#ff4081",
        weight: 3,
        fillColor: "#ff4081",
        fillOpacity: 0.4,
      }).addTo(map);

      const cache = new Cache(i, j, [], rect);
      cache.fromMemento(coins as string);
      cacheMap.set(key, cache);
      cacheStorage.set(key, coins as string);

      setupCachePopup(cache, key, cacheLocation);
    });
  }
}

function resetGame() {
  cacheMap.forEach((cache) => {
    cache.setVisible(false);
  });
  playerCoins = 0;
  playerMarker.setLatLng(OAKES_CLASSROOM);
  playerPosition = leaflet.latLng(36.98949379578401, -122.06277128548504);
  map.setView(OAKES_CLASSROOM, GAMEPLAY_ZOOM_LEVEL);
  statusPanel.innerHTML = `Coins: ${playerCoins}`;

  if (geolocationWatchId !== null) {
    toggleGeolocationTracking();
  }
  playerPath.length = 0;
  playerPolyline.setLatLngs([]);

  playerTile.i = 0;
  playerTile.j = 0;
  collectedCoins.length = 0;

  cacheMap.clear();
  cacheStorage.clear();
  localStorage.clear();
  regenerateCachesAroundPlayer();
}

document.addEventListener("DOMContentLoaded", () => {
  loadGameData();
  regenerateCachesAroundPlayer();
});
