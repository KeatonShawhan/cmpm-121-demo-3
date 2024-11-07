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

class CellFactory {
  private static cells: Map<string, Cell> = new Map();

  static getCell(i: number, j: number): Cell {
    const key = `${i},${j}`;
    if (!this.cells.has(key)) {
      this.cells.set(key, new Cell(i, j));
    }
    return this.cells.get(key)!;
  }
}

class Coin {
  constructor(
    public i: number,
    public j: number,
    public serial: number,
  ) {}
}

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
  const globalI = Math.floor(
    (OAKES_CLASSROOM.lat - GLOBAL_ORIGIN.lat) / TILE_DEGREES + i,
  );
  const globalJ = Math.floor(
    (OAKES_CLASSROOM.lng - GLOBAL_ORIGIN.lng) / TILE_DEGREES + j,
  );

  const cacheCoins = Math.floor(luck([i, j, "initialValue"].toString()) * 10);

  const _cell = CellFactory.getCell(globalI, globalJ);

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

  rect.bindPopup(() => {
    if (playerPosition.distanceTo(cacheLocation) > INTERACTION_RADIUS) {
      return `<div>You need to be closer to interact with this cache.</div>`;
    }

    const popupDiv = document.createElement("div");

    const coinList = cacheCoinsArray.map((coin) => {
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
        if (cacheCoinsArray.length > 0) {
          const collectedCoin = cacheCoinsArray.shift();
          if (collectedCoin) {
            collectedCoins.push(collectedCoin);
            playerCoins++;
            statusPanel.innerHTML = `Player coins: ${playerCoins}`;

            popupDiv.querySelector("ul")!.innerHTML = cacheCoinsArray.map(
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
            cacheCoinsArray.push(depoCoin);
            playerCoins--;
            statusPanel.innerHTML = `Player coins: ${playerCoins}`;
          }

          popupDiv.querySelector("ul")!.innerHTML = cacheCoinsArray.map(
            (coin) => {
              return `<li>Coin: ${coin.i}:${coin.j}#${coin.serial}</li>`;
            },
          ).join("");
        } else {
          alert("No coins in your inventory to deposit.");
        }
      },
    );

    return popupDiv;
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

const controls = document.getElementById("controlPanel")!;
controls.addEventListener("click", (event) => {
  const direction = (event.target as HTMLElement).id;
  if (["north", "south", "west", "east"].includes(direction)) {
    movePlayer(direction as "north" | "south" | "west" | "east");
  } else if (direction === "reset") {
    resetGame();
  }
});

function movePlayer(direction: "north" | "south" | "west" | "east") {
  let { lat, lng } = playerMarker.getLatLng();
  if (direction === "north") lat += TILE_DEGREES;
  if (direction === "south") lat -= TILE_DEGREES;
  if (direction === "east") lng += TILE_DEGREES;
  if (direction === "west") lng -= TILE_DEGREES;
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
