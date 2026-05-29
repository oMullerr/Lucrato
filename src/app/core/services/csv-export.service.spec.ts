import { CsvExportService } from './csv-export.service';

describe('CsvExportService', () => {
  let service: CsvExportService;

  beforeEach(() => {
    service = new CsvExportService();
  });

  describe('formatCell (via cast)', () => {
    const formatCell = (v: unknown) => (service as any).formatCell(v) as string;

    it('retorna "" para null', () => {
      expect(formatCell(null)).toBe('');
    });

    it('retorna "" para undefined', () => {
      expect(formatCell(undefined)).toBe('');
    });

    it('formata número inteiro sem decimais', () => {
      expect(formatCell(10)).toBe('10');
      expect(formatCell(0)).toBe('0');
      expect(formatCell(-5)).toBe('-5');
    });

    it('formata número decimal com vírgula como separador (2 casas)', () => {
      expect(formatCell(10.5)).toBe('10,50');
      expect(formatCell(1234.567)).toBe('1234,57');
      expect(formatCell(-3.14)).toBe('-3,14');
    });

    it('formata Date como DD/MM/YYYY', () => {
      const date = new Date(2025, 11, 31); // Dec 31, 2025 (local)
      expect(formatCell(date)).toBe('31/12/2025');
    });

    it('faz pad de dia e mês com zero', () => {
      const date = new Date(2025, 0, 5); // Jan 5, 2025
      expect(formatCell(date)).toBe('05/01/2025');
    });

    it('coage strings para si mesmas', () => {
      expect(formatCell('hello')).toBe('hello');
      expect(formatCell('')).toBe('');
    });

    it('coage outros tipos via String()', () => {
      expect(formatCell(true)).toBe('true');
      expect(formatCell(false)).toBe('false');
    });
  });

  describe('escape (via cast)', () => {
    const escape = (v: string) => (service as any).escape(v) as string;

    it('retorna sem alteração quando não há caracteres especiais', () => {
      expect(escape('hello world')).toBe('hello world');
      expect(escape('123')).toBe('123');
      expect(escape('')).toBe('');
    });

    it('envolve em aspas quando contém ;', () => {
      expect(escape('a;b')).toBe('"a;b"');
    });

    it('escapa aspas duplas duplicando-as e envolve tudo em aspas', () => {
      expect(escape('a"b')).toBe('"a""b"');
    });

    it('envolve em aspas quando contém \\n', () => {
      expect(escape('linha1\nlinha2')).toBe('"linha1\nlinha2"');
    });

    it('envolve em aspas quando contém \\r', () => {
      expect(escape('linha1\rlinha2')).toBe('"linha1\rlinha2"');
    });

    it('escapa múltiplas combinações ; + "', () => {
      expect(escape('a;b"c')).toBe('"a;b""c"');
    });
  });

  describe('download', () => {
    let createObjectURL: jest.Mock;
    let revokeObjectURL: jest.Mock;
    let originalCreateObjectURL: typeof URL.createObjectURL;
    let originalRevokeObjectURL: typeof URL.revokeObjectURL;
    let originalBlob: typeof globalThis.Blob;
    let capturedCsv: string | undefined;

    beforeEach(() => {
      capturedCsv = undefined;
      originalBlob = globalThis.Blob;
      // Capture o conteúdo do CSV interceptando o construtor do Blob.
      class CapturingBlob extends originalBlob {
        constructor(parts: BlobPart[], options?: BlobPropertyBag) {
          super(parts, options);
          capturedCsv = parts.map(p => (typeof p === 'string' ? p : '')).join('');
        }
      }
      globalThis.Blob = CapturingBlob as unknown as typeof globalThis.Blob;

      createObjectURL = jest.fn(() => 'blob:fake-url');
      revokeObjectURL = jest.fn();
      originalCreateObjectURL = URL.createObjectURL;
      originalRevokeObjectURL = URL.revokeObjectURL;
      URL.createObjectURL = createObjectURL as unknown as typeof URL.createObjectURL;
      URL.revokeObjectURL = revokeObjectURL as unknown as typeof URL.revokeObjectURL;
    });

    afterEach(() => {
      URL.createObjectURL = originalCreateObjectURL;
      URL.revokeObjectURL = originalRevokeObjectURL;
      globalThis.Blob = originalBlob;
    });

    function readCsv(): string {
      if (capturedCsv === undefined) throw new Error('Blob não foi criado');
      return capturedCsv;
    }

    it('cria um <a>, dispara click e limpa do DOM', () => {
      const clickSpy = jest.fn();
      const createElementSpy = jest
        .spyOn(document, 'createElement')
        .mockImplementation(() => {
          const a = {
            href: '',
            download: '',
            click: clickSpy,
          } as unknown as HTMLAnchorElement;
          return a;
        });
      const appendSpy = jest.spyOn(document.body, 'appendChild').mockImplementation((node) => node);
      const removeSpy = jest.spyOn(document.body, 'removeChild').mockImplementation((node) => node);

      service.download('teste', ['A', 'B'], [{ A: 1, B: 2 }]);

      expect(createElementSpy).toHaveBeenCalledWith('a');
      expect(appendSpy).toHaveBeenCalled();
      expect(clickSpy).toHaveBeenCalledTimes(1);
      expect(removeSpy).toHaveBeenCalled();
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:fake-url');

      createElementSpy.mockRestore();
      appendSpy.mockRestore();
      removeSpy.mockRestore();
    });

    it('adiciona ".csv" ao filename quando não tem extensão', () => {
      let capturedDownload = '';
      const createElementSpy = jest
        .spyOn(document, 'createElement')
        .mockImplementation(() => {
          const a = {
            set href(_: string) {},
            set download(v: string) { capturedDownload = v; },
            click: jest.fn(),
          } as unknown as HTMLAnchorElement;
          return a;
        });
      jest.spyOn(document.body, 'appendChild').mockImplementation((n) => n);
      jest.spyOn(document.body, 'removeChild').mockImplementation((n) => n);

      service.download('relatorio', ['A'], []);

      expect(capturedDownload).toBe('relatorio.csv');
      createElementSpy.mockRestore();
    });

    it('preserva ".csv" quando filename já tem a extensão', () => {
      let capturedDownload = '';
      jest.spyOn(document, 'createElement').mockImplementation(() => ({
        set href(_: string) {},
        set download(v: string) { capturedDownload = v; },
        click: jest.fn(),
      } as unknown as HTMLAnchorElement));
      jest.spyOn(document.body, 'appendChild').mockImplementation((n) => n);
      jest.spyOn(document.body, 'removeChild').mockImplementation((n) => n);

      service.download('vendas.csv', ['A'], []);

      expect(capturedDownload).toBe('vendas.csv');
    });

    it('gera CSV com BOM UTF-8 e separador ";"', () => {
      jest.spyOn(document, 'createElement').mockImplementation(() => ({
        href: '',
        download: '',
        click: jest.fn(),
      } as unknown as HTMLAnchorElement));
      jest.spyOn(document.body, 'appendChild').mockImplementation((n) => n);
      jest.spyOn(document.body, 'removeChild').mockImplementation((n) => n);

      service.download(
        'teste',
        ['Produto', 'Preço'],
        [
          { Produto: 'Camisa', 'Preço': 25.5 },
          { Produto: 'Calça', 'Preço': 100 },
        ],
      );

      const csv = readCsv();
      expect(csv.charCodeAt(0)).toBe(0xFEFF);
      expect(csv).toContain('Produto;Preço');
      expect(csv).toContain('Camisa;25,50');
      expect(csv).toContain('Calça;100');
      expect(csv.split('\r\n').length).toBe(3);
    });

    it('respeita o parâmetro keys quando headers são labels diferentes', () => {
      jest.spyOn(document, 'createElement').mockImplementation(() => ({
        href: '', download: '', click: jest.fn(),
      } as unknown as HTMLAnchorElement));
      jest.spyOn(document.body, 'appendChild').mockImplementation((n) => n);
      jest.spyOn(document.body, 'removeChild').mockImplementation((n) => n);

      service.download(
        'teste',
        ['Nome do Produto', 'Valor'],
        [{ product: 'Camisa', price: 25 }],
        ['product', 'price'],
      );

      const csv = readCsv();
      expect(csv).toContain('Nome do Produto;Valor');
      expect(csv).toContain('Camisa;25');
    });

    it('escapa células com ; ou aspas dentro do CSV', () => {
      jest.spyOn(document, 'createElement').mockImplementation(() => ({
        href: '', download: '', click: jest.fn(),
      } as unknown as HTMLAnchorElement));
      jest.spyOn(document.body, 'appendChild').mockImplementation((n) => n);
      jest.spyOn(document.body, 'removeChild').mockImplementation((n) => n);

      service.download(
        'teste',
        ['Nota'],
        [{ Nota: 'a;b' }, { Nota: 'a"b' }],
      );

      const csv = readCsv();
      expect(csv).toContain('"a;b"');
      expect(csv).toContain('"a""b"');
    });

    it('gera apenas o header quando rows está vazio', () => {
      jest.spyOn(document, 'createElement').mockImplementation(() => ({
        href: '', download: '', click: jest.fn(),
      } as unknown as HTMLAnchorElement));
      jest.spyOn(document.body, 'appendChild').mockImplementation((n) => n);
      jest.spyOn(document.body, 'removeChild').mockImplementation((n) => n);

      service.download('teste', ['A', 'B'], []);

      const csv = readCsv();
      // BOM + "A;B"
      expect(csv.slice(1)).toBe('A;B');
    });
  });
});
