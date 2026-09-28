/**
 * El índice de un `.ifczip`, contra **zips de verdad** escritos aquí mismo con `node:zlib`: así lo
 * que se comprueba es el formato, no una copia de nuestra propia lectura.
 *
 * El oráculo final es descomprimir el tramo que devuelve `modeloDelZip` con `inflateRawSync` y
 * obtener el IFC original byte a byte: si el inicio de los datos se corriera un solo byte, falla.
 */
import { deflateRawSync, inflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";

import { esZip, indiceZip, modeloDelZip } from "./ifczip.js";

const IFC = new TextEncoder().encode(
  "ISO-10303-21;\nHEADER;\nFILE_DESCRIPTION(('ViewDefinition'),'2;1');\nENDSEC;\nDATA;\n" +
    "#1=IFCPROJECT('0YvctVUKr0kugbFTf53O9L',$,'Metro',$,$,$,$,$,$);\nENDSEC;\nEND-ISO-10303-21;\n",
);

interface Miembro {
  nombre: string;
  datos: Uint8Array;
  comprimir?: boolean;
  /** Un campo «extra» en la cabecera local distinto del del índice, que es lo que pasa en la calle. */
  extraLocal?: number;
  cifrado?: boolean;
}

function u16(n: number): number[] {
  return [n & 0xff, (n >>> 8) & 0xff];
}
function u32(n: number): number[] {
  return [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff];
}

/** Un zip mínimo y correcto: cabeceras locales, índice central y su fin. Sin CRC: no se usa. */
function zip(miembros: Miembro[]): Uint8Array {
  const partes: number[] = [];
  const central: number[] = [];
  for (const m of miembros) {
    const nombre = [...new TextEncoder().encode(m.nombre)];
    const datos = m.comprimir === false ? m.datos : new Uint8Array(deflateRawSync(m.datos));
    const metodo = m.comprimir === false ? 0 : 8;
    const banderas = m.cifrado ? 1 : 0;
    const extra: number[] = Array.from({ length: m.extraLocal ?? 0 }, () => 0);
    const desplazamiento = partes.length;
    partes.push(
      ...u32(0x04034b50),
      ...u16(20),
      ...u16(banderas),
      ...u16(metodo),
      ...u32(0),
      ...u32(0),
      ...u32(datos.length),
      ...u32(m.datos.length),
      ...u16(nombre.length),
      ...u16(extra.length),
      ...nombre,
      ...extra,
      ...datos,
    );
    central.push(
      ...u32(0x02014b50),
      ...u16(20),
      ...u16(20),
      ...u16(banderas),
      ...u16(metodo),
      ...u32(0),
      ...u32(0),
      ...u32(datos.length),
      ...u32(m.datos.length),
      ...u16(nombre.length),
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u32(0),
      ...u32(desplazamiento),
      ...nombre,
    );
  }
  const inicioCentral = partes.length;
  partes.push(...central);
  partes.push(
    ...u32(0x06054b50),
    ...u16(0),
    ...u16(0),
    ...u16(miembros.length),
    ...u16(miembros.length),
    ...u32(central.length),
    ...u32(inicioCentral),
    ...u16(0),
  );
  return new Uint8Array(partes);
}

function salida(bytes: Uint8Array, tope = 1e9): Uint8Array {
  const m = modeloDelZip(bytes, tope);
  const tramo = bytes.subarray(m.inicio, m.fin);
  return m.metodo === 0 ? tramo : new Uint8Array(inflateRawSync(tramo));
}

describe("ifczip", () => {
  it("reconoce un zip por su firma y no confunde un IFC con uno", () => {
    expect(esZip(zip([{ nombre: "m.ifc", datos: IFC }]))).toBe(true);
    expect(esZip(IFC)).toBe(false);
  });

  it("devuelve el IFC exacto, comprimido o guardado", () => {
    expect(salida(zip([{ nombre: "modelo.ifc", datos: IFC }]))).toEqual(IFC);
    expect(salida(zip([{ nombre: "modelo.ifc", datos: IFC, comprimir: false }]))).toEqual(IFC);
  });

  it("encuentra los datos con un campo extra local distinto del del índice", () => {
    expect(salida(zip([{ nombre: "modelo.ifc", datos: IFC, extraLocal: 28 }]))).toEqual(IFC);
  });

  it("encuentra el modelo aunque no sea la primera entrada", () => {
    const bytes = zip([
      { nombre: "leeme.txt", datos: new TextEncoder().encode("hola") },
      { nombre: "Estacion/E3.IFC", datos: IFC },
    ]);
    expect(salida(bytes)).toEqual(IFC);
    expect(indiceZip(bytes).map((e) => e.nombre)).toEqual(["leeme.txt", "Estacion/E3.IFC"]);
  });

  it("exige exactamente un .ifc, sin contar la basura del Finder", () => {
    expect(() =>
      modeloDelZip(
        zip([
          { nombre: "a.ifc", datos: IFC },
          { nombre: "b.ifc", datos: IFC },
        ]),
        1e9,
      ),
    ).toThrow(/exactamente un/);
    expect(() => modeloDelZip(zip([{ nombre: "a.txt", datos: IFC }]), 1e9)).toThrow(/trae 0/);
    expect(
      salida(
        zip([
          { nombre: "__MACOSX/._m.ifc", datos: IFC },
          { nombre: "m.ifc", datos: IFC },
        ]),
      ),
    ).toEqual(IFC);
  });

  it("rechaza lo cifrado y lo que pasa del tope, antes de descomprimir", () => {
    expect(() => modeloDelZip(zip([{ nombre: "m.ifc", datos: IFC, cifrado: true }]), 1e9)).toThrow(
      /contraseña/,
    );
    expect(() => modeloDelZip(zip([{ nombre: "m.ifc", datos: IFC }]), IFC.length - 1)).toThrow(
      /navegador/,
    );
  });

  it("un zip cortado da un motivo y no lee memoria que no es suya", () => {
    const entero = zip([{ nombre: "m.ifc", datos: IFC }]);
    expect(() => modeloDelZip(entero.subarray(0, 40), 1e9)).toThrow(/cortado|índice/);
  });
});
