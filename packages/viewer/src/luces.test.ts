import { describe, expect, it } from "vitest";
import {
  COLOR_POR_DEFECTO,
  LUZ_POR_DEFECTO,
  colorDeVista,
  direccionDeLuzPrincipal,
  guardarEleccion,
  leerEleccion,
  parametrosDeLuz,
} from "./luces.js";

const largo = (v: { x: number; y: number; z: number }) => Math.hypot(v.x, v.y, v.z);
const punto = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) =>
  a.x * b.x + a.y * b.y + a.z * b.z;

describe("parámetros de luz", () => {
  it("por defecto es la luz de revisión y los colores del IFC", () => {
    expect(LUZ_POR_DEFECTO).toBe("revision");
    expect(COLOR_POR_DEFECTO).toBe("ifc");
  });

  it("«uniforme» conserva los valores de antes (sin luz que siga a la cámara)", () => {
    expect(parametrosDeLuz("uniforme")).toMatchObject({
      ambiente: 0.25,
      hemisferio: 0.85,
      sol: 2.2,
      principal: 0,
      tonos: "ninguno",
    });
  });

  it("la revisión tiene luz principal y menos luz difusa que la uniforme", () => {
    const r = parametrosDeLuz("revision");
    const u = parametrosDeLuz("uniforme");
    expect(r.principal).toBeGreaterThan(0);
    expect(r.ambiente + r.hemisferio).toBeLessThan(u.ambiente + u.hemisferio);
  });
});

describe("color de la vista", () => {
  it("«ifc» no sustituye ningún color", () => {
    expect(colorDeVista("ifc")).toBeNull();
  });
  it("«neutro» da un gris claro", () => {
    const c = colorDeVista("neutro");
    expect(c).not.toBeNull();
    const canales = [(c! >> 16) & 255, (c! >> 8) & 255, c! & 255];
    expect(Math.min(...canales)).toBeGreaterThan(160);
    expect(Math.max(...canales) - Math.min(...canales)).toBeLessThan(16);
  });
});

describe("dirección de la luz principal", () => {
  it("es unitaria y queda del lado de la cámara", () => {
    const d = direccionDeLuzPrincipal({ x: 10, y: 8, z: 10 }, { x: 0, y: 0, z: 0 });
    expect(d).not.toBeNull();
    expect(largo(d!)).toBeCloseTo(1, 9);
    const haciaCamara = { x: 10 / 16.9, y: 8 / 16.9, z: 10 / 16.9 };
    expect(punto(d!, haciaCamara)).toBeGreaterThan(0.6);
  });

  it("no coincide con la línea de visión: sin desplazamiento no habría relieve", () => {
    const d = direccionDeLuzPrincipal({ x: 0, y: 0, z: 20 }, { x: 0, y: 0, z: 0 })!;
    // Mirando por -Z, la luz queda más arriba (+Y) y a la derecha de la cámara.
    expect(d.y).toBeGreaterThan(0.3);
    expect(d.z).toBeLessThan(0.95);
  });

  it("sigue a la cámara: al girarla, la luz gira con ella", () => {
    const a = direccionDeLuzPrincipal({ x: 20, y: 5, z: 0 }, { x: 0, y: 0, z: 0 })!;
    const b = direccionDeLuzPrincipal({ x: 0, y: 5, z: 20 }, { x: 0, y: 0, z: 0 })!;
    expect(a.x).toBeGreaterThan(0.5);
    expect(b.z).toBeGreaterThan(0.5);
  });

  it("en planta (cámara justo encima) sigue dando una dirección válida", () => {
    const d = direccionDeLuzPrincipal({ x: 0, y: 30, z: 0 }, { x: 0, y: 0, z: 0 })!;
    expect(largo(d)).toBeCloseTo(1, 9);
    expect(d.y).toBeGreaterThan(0.5);
  });

  it("cámara y objetivo en el mismo punto: sin dirección", () => {
    expect(direccionDeLuzPrincipal({ x: 1, y: 1, z: 1 }, { x: 1, y: 1, z: 1 })).toBeNull();
  });
});

describe("memoria de la elección", () => {
  const almacen = (datos: Record<string, string>) => ({
    getItem: (k: string) => datos[k] ?? null,
    setItem: (k: string, v: string) => void (datos[k] = v),
  });

  it("sin nada guardado, los valores por defecto", () => {
    expect(leerEleccion(almacen({}))).toEqual({ luz: "revision", color: "ifc" });
    expect(leerEleccion(undefined)).toEqual({ luz: "revision", color: "ifc" });
  });

  it("va y vuelve", () => {
    const datos: Record<string, string> = {};
    guardarEleccion(almacen(datos), { luz: "uniforme", color: "neutro" });
    expect(leerEleccion(almacen(datos))).toEqual({ luz: "uniforme", color: "neutro" });
  });

  it("un valor ajeno se descarta", () => {
    expect(leerEleccion(almacen({ "aerobim.luz": "x", "aerobim.colorDeVista": "y" }))).toEqual({
      luz: "revision",
      color: "ifc",
    });
  });

  it("un almacenamiento que lanza no rompe nada", () => {
    const roto = {
      getItem: () => {
        throw new Error("bloqueado");
      },
      setItem: () => {
        throw new Error("bloqueado");
      },
    };
    expect(leerEleccion(roto)).toEqual({ luz: "revision", color: "ifc" });
    expect(() => guardarEleccion(roto, { luz: "uniforme", color: "ifc" })).not.toThrow();
  });
});
