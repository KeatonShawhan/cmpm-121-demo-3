import leaflet from "leaflet";
import "leaflet/dist/leaflet.css";
import "./style.css";
import "./leafletWorkaround.ts";
import luck from "./luck.ts";

const OAKES_CLASSROOM = leaflet.latLng(36.98949379578401, -122.06277128548504);
const TILE_DEGREES = 0.0001;
const NEIGHBORHOOD_SIZE = 8;
const CACHE_SPAWN_PROBABILITY = 0.05;
const GAMEPLAY_ZOOM_LEVEL = 19;
const GLOBAL_ORIGIN = leaflet.latLng(0, 0);

class Cell {
  i: number;
  j: number;

  constructor(i: number, j: number) {
    this.i = i;
    this.j = j;
  }
}

const playerTile = new Cell(0, 0);

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

function spawnCache(i: number, j: number) {
  const cacheKey = `${i},${j}`;
  if (cacheStorage.has(cacheKey)) {
    return;
  }

  const globalI = Math.floor(
    (OAKES_CLASSROOM.lat - GLOBAL_ORIGIN.lat) / TILE_DEGREES + i,
  );
  const globalJ = Math.floor(
    (OAKES_CLASSROOM.lng - GLOBAL_ORIGIN.lng) / TILE_DEGREES + j,
  );

  const cacheCoins = Math.floor(luck([i, j, "initialValue"].toString()) * 10);

  const cacheColor = "#ff4081";
  const cacheLocation = leaflet.latLng(
    GLOBAL_ORIGIN.lat + globalI * TILE_DEGREES,
    GLOBAL_ORIGIN.lng + globalJ * TILE_DEGREES,
  );

  const rect = leaflet.rectangle(
    [
      [cacheLocation.lat, cacheLocation.lng],
      [cacheLocation.lat + TILE_DEGREES, cacheLocation.lng + TILE_DEGREES],
    ],
    {
      color: cacheColor,
      weight: 3,
      fillColor: cacheColor,
      fillOpacity: 0.4,
    },
  );
  rect.addTo(map);

  const cacheCoinsArray: Coin[] = [];
  for (let serial = 0; serial < cacheCoins; serial++) {
    const coin = new Coin(globalI, globalJ, serial);
    cacheCoinsArray.push(coin);
  }

  const cache = new Cache(globalI, globalJ, cacheCoinsArray, rect);
  cacheStorage.set(cacheKey, cache.toMemento());
  cacheMap.set(`${i},${j}`, cache);
  console.log(`Spawned cache at ${cacheKey}`, cache);

  rect.bindPopup(() => {
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
      <div>Cache location: "${globalI},${globalJ}"</div>
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

            popupDiv.querySelector("ul")!.innerHTML = loadedCache
              .cacheCoinsArray.map(
                (coin) => {
                  return `<li>Coin: ${coin.i}:${coin.j}#${coin.serial}</li>`;
                },
              ).join("");
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
                (coin) => {
                  return `<li>Coin: ${coin.i}:${coin.j}#${coin.serial}</li>`;
                },
              ).join("");
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
  const { i, j } = playerTile;
  cacheMap.forEach((cache, key) => {
    const [cacheI, cacheJ] = key.split(",").map(Number);
    const isInVisibleRange = Math.abs(i - cacheI) <= NEIGHBORHOOD_SIZE &&
      Math.abs(j - cacheJ) <= NEIGHBORHOOD_SIZE;
    if (isInVisibleRange) {
      cache.setVisible(true);
    } else {
      cache.setVisible(false);
    }
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
  const { i, j } = playerTile;
  for (let x = -NEIGHBORHOOD_SIZE; x <= NEIGHBORHOOD_SIZE; x++) {
    for (let y = -NEIGHBORHOOD_SIZE; y <= NEIGHBORHOOD_SIZE; y++) {
      const cacheKey = `${i + x},${j + y}`;
      if (
        !cacheStorage.has(cacheKey) &&
        luck([i + x, j + y].toString()) < CACHE_SPAWN_PROBABILITY
      ) {
        spawnCache(i + x, j + y);
      }
    }
  }
}

const controls = document.getElementById("controlPanel")!;
controls.addEventListener("click", (event) => {
  const direction = (event.target as HTMLElement).id;
  if (["north", "south", "west", "east"].includes(direction)) {
    movePlayer(direction as "north" | "south" | "west" | "east");
    regenerateCachesAroundPlayer();
  } else if (direction === "reset") {
    resetGame();
  }
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
}

function resetGame() {
  playerCoins = 0;
  playerMarker.setLatLng(OAKES_CLASSROOM);
  map.setView(OAKES_CLASSROOM, GAMEPLAY_ZOOM_LEVEL);
  statusPanel.innerHTML = `Coins: ${playerCoins}`;
}
