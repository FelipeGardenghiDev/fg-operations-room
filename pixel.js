'use strict';

/* AI Operations Room — escritório pixel art (Lote 5, aprovado em 05/10/2026).

   Motor da visualização do escritório pixel.

   O que muda em relação ao Escritório vetorial:
   - Cada sala de projeto é um andar inteiro com três áreas e passagens entre
     elas: estações de trabalho, café e sala de estar.
   - Lugar é AMBIENTAÇÃO, não estado. Toda pessoa visível circula entre as
     áreas; trabalhar na mesa é uma atividade possível, não a posição de quem
     está "trabalhando". O estado verdadeiro está sempre no personagem — o
     marcador sobre a cabeça e a borda da placa têm a cor do estado — e no
     detalhe ao clicar. Para a cena não contradizer o estado: só quem está
     trabalhando ou delegando digita e acende o monitor; a escolha da
     próxima área pesa o estado (quem trabalha vai mais à mesa).
   - Sem porta: quem aparece surge discretamente num lugar; quem encerra vai
     para a convivência (café ou sala de estar) e fica até 12 h depois do
     último evento gravado; ao vencer, some devagar onde estiver. Quem decide
     o prazo é definido pela API. Na órfã, o prazo conta de quando a morte foi
     percebida.
   - Órfã vai para a convivência e para ali, com o balão "!".

   Nada de ação específica ("lendo arquivo", "pedindo permissão"): os seis
   hooks não entregam isso (docs/AGENTES_HOOKS.md). Digitar = trabalhando
   ou delegando, e só.

   Arte original, desenhada em código. Nenhum sprite vem do Pixel Agents nem
   de pacote de terceiros (lá o código é MIT, mas móveis e pisos não têm
   licença declarada: issue #355 do repositório deles). Cada sprite é um
   mapa de caracteres que vira um <path> por cor (crispEdges): escala sem
   borrar, sem canvas, sem arquivo. Pele, cabelo e roupa entram por variável
   CSS, então um símbolo serve para todas as pessoas.

   Duas camadas:
   - `logica`: sprites, planta da sala, vagas, grade de circulação, rota
     (A* em 4 direções), escolha de área por estado. Sem DOM; tests/js cobre.
   - o resto: DOM, quadros, caminhada por rAF, diferença por id (sem
     redesenho, sem flicker), laço pai → filha, rota do tipo. */

(function (raiz) {
  const P = 3; // unidades do viewBox por pixel de arte
  const SW = 12; // sprite: largura
  const SH = 20; // sprite: altura (âncora = pés, embaixo e no centro)
  const ATIVOS = ['trabalhando', 'aguardando', 'delegando'];
  const CONVIVENCIA = ['cafe', 'estar', 'banheiro'];

  /* ---------------------------------------------------------- pessoas */

  // O contorno · S/s pele · R/r cabelo · E olho · T/t camisa · P calça ·
  // B sapato · H/h fone (só o Claude principal)
  const CABECAS = {
    frente: {
      curto: [
        '............', '...OOOOOO...', '..ORRRRRRO..', '.ORRRRRRRRO.', '.ORRRRRRRRO.',
        '.ORSSSSSSRO.', '.OSSESSESSO.', '.OSSSSSSSSO.', '..OSSSSSSO..', '...OOssOO...',
      ],
      longo: [
        '............', '...OOOOOO...', '..ORRRRRRO..', '.ORRRRRRRRO.', '.ORRRRRRRRO.',
        '.ORSSSSSSRO.', '.ORSESSESRO.', '.ORSSSSSSRO.', '.ORRSSSSRRO.', '..ORRssRRO..',
      ],
      coque: [
        '....OOOO....', '...ORrrRO...', '..ORRRRRRO..', '.ORRRRRRRRO.', '.ORRRRRRRRO.',
        '.ORSSSSSSRO.', '.OSSESSESSO.', '.OSSSSSSSSO.', '..OSSSSSSO..', '...OOssOO...',
      ],
      cacheado: [
        '...OOOOOO...', '..ORRrRRRO..', '.ORRRRRrRRO.', 'ORrRRRRRRrRO', 'ORRRRRRRRRRO',
        'ORRSSSSSSRRO', '.OSSESSESSO.', '.OSSSSSSSSO.', '..OSSSSSSO..', '...OOssOO...',
      ],
    },
    costas: {
      curto: [
        '............', '...OOOOOO...', '..ORRRRRRO..', '.ORRRRRRRRO.', '.ORRRRRRRRO.',
        '.ORRRRRRRRO.', '.ORRRrrRRRO.', '.OSRRRRRRSO.', '..ORRRRRRO..', '...OOssOO...',
      ],
      longo: [
        '............', '...OOOOOO...', '..ORRRRRRO..', '.ORRRRRRRRO.', '.ORRRRRRRRO.',
        '.ORRRRRRRRO.', '.ORRRrrRRRO.', '.ORRRRRRRRO.', '.ORRRRRRRRO.', '..ORRrrRRO..',
      ],
      coque: [
        '....OOOO....', '...ORrrRO...', '..ORRRRRRO..', '.ORRRRRRRRO.', '.ORRRRRRRRO.',
        '.ORRRRRRRRO.', '.ORRRrrRRRO.', '.OSRRRRRRSO.', '..ORRRRRRO..', '...OOssOO...',
      ],
      cacheado: [
        '...OOOOOO...', '..ORRrRRRO..', '.ORRRRRrRRO.', 'ORrRRRRRRrRO', 'ORRRRRRRRRRO',
        'ORRRRrRRRRRO', '.ORRRRRRrRO.', '.OSRRRRRRSO.', '..ORRRRRRO..', '...OOssOO...',
      ],
    },
    lado: {
      curto: [
        '............', '...OOOOOO...', '..ORRRRRRO..', '.ORRRRRRRRO.', '.ORRRRRRRRO.',
        '.ORRRRSSSSO.', '.ORRRSSSESO.', '.ORRSSSSSSO.', '..ORSSSSSO..', '....OssO....',
      ],
      longo: [
        '............', '...OOOOOO...', '..ORRRRRRO..', '.ORRRRRRRRO.', '.ORRRRRRRRO.',
        '.ORRRRSSSSO.', '.ORRRSSSESO.', '.ORRRSSSSSO.', '.ORRRSSSSO..', '.ORRROssO...',
      ],
      coque: [
        '....OOOO....', '...ORrrRO...', '..ORRRRRRO..', '.ORRRRRRRRO.', '.ORRRRRRRRO.',
        '.ORRRRSSSSO.', '.ORRRSSSESO.', '.ORRSSSSSSO.', '..ORSSSSSO..', '....OssO....',
      ],
      cacheado: [
        '...OOOOOO...', '..ORRrRRRO..', '.ORRRRRrRRO.', 'ORrRRRRRRRRO', 'ORRRRRRRRRRO',
        'ORRRRRSSSSO.', '.ORRRSSSESO.', '.ORRSSSSSSO.', '..ORSSSSSO..', '....OssO....',
      ],
    },
  };

  const PERNAS_PE = ['..OPPOOPPO..', '..OBBOOBBO..', '...OO..OO...'];
  const PERNAS_A = ['..OPPOOBBO..', '..OBBO.OO...', '...OO.......'];
  const PERNAS_B = ['..OBBOOPPO..', '...OO.OBBO..', '.......OO...'];
  const troncoFrente = ['..OTTTTTTO..', '.OTTTTTTTTO.', '.OTtTTTTtTO.', '.OSOTTTTOSO.', '..OOTTTTOO..', '..OPPPPPPO..', '..OPPOOPPO..'];
  const troncoCostas = ['..OTTTTTTO..', '.OTTTTTTTTO.', '.OTTTTTTTTO.', '.OSOTTTTOSO.', '..OOTTTTOO..', '..OPPPPPPO..', '..OPPOOPPO..'];
  const ladoPe = [
    '...OTTTTO...', '...OTTTTO...', '...OTtTTO...', '...OTTSTO...', '...OTTTTO...',
    '...OPPPPO...', '...OPPPPO...', '...OPPPPO...', '...OBBBBBO..', '....OOOOO...',
  ];
  const ladoPasso = [
    '...OTTTTO...', '...OTTTTO...', '...OTtTTO...', '...OTTTSO...', '...OTTTTO...',
    '...OPPPPO...', '..OPPOOPPO..', '.OPPO..OPPO.', '.OBBO..OBBBO', '..OO....OOO.',
  ];
  const sentadoCostas = (maos) => [
    '..OTTTTTTO..', '.OTTTTTTTTO.', maos[0], maos[1], '..OTTTTTTO..',
    '..OPPPPPPO..', '...OOOOOO...', '............', '............', '............',
  ];
  const sentadoFrente = [
    '..OTTTTTTO..', '.OTTTTTTTTO.', '.OTtTTTTtTO.', '.OSOTTTTOSO.', '..OPPPPPPO..',
    '..OPPPPPPO..', '..OPPOOPPO..', '..OBBOOBBO..', '...OO..OO...', '............',
  ];

  /* pose -> vista da cabeça, corpo de cada quadro, e se o quadro 2 pisca */
  const POSES = {
    'pe-frente': { vista: 'frente', corpos: [[...troncoFrente, ...PERNAS_PE], [...troncoFrente, ...PERNAS_PE]], piscar: true },
    'andar-frente': { vista: 'frente', corpos: [[...troncoFrente, ...PERNAS_A], [...troncoFrente, ...PERNAS_B]] },
    'pe-costas': { vista: 'costas', corpos: [[...troncoCostas, ...PERNAS_PE], [...troncoCostas, ...PERNAS_PE]] },
    'andar-costas': { vista: 'costas', corpos: [[...troncoCostas, ...PERNAS_A], [...troncoCostas, ...PERNAS_B]] },
    'pe-lado': { vista: 'lado', corpos: [ladoPe, ladoPe] },
    'andar-lado': { vista: 'lado', corpos: [ladoPasso, ladoPe] },
    digitar: {
      vista: 'costas',
      corpos: [sentadoCostas(['OSTTTTTTTTO.', '.OTTTTTTTTSO']), sentadoCostas(['.OTTTTTTTTSO', 'OSTTTTTTTTO.'])],
    },
    'sentado-costas': { vista: 'costas', corpos: [sentadoCostas(['.OTTTTTTTTO.', '.OSTTTTTTSO.']), sentadoCostas(['.OTTTTTTTTO.', '.OSTTTTTTSO.'])] },
    'sentado-frente': { vista: 'frente', corpos: [sentadoFrente, sentadoFrente], piscar: true },
  };
  const ESTILOS = ['curto', 'longo', 'coque', 'cacheado'];

  // fone do principal: [linha, coluna, letra], só onde já há desenho
  const FONE = {
    frente: [[2, 3, 'H'], [2, 4, 'H'], [2, 5, 'H'], [2, 6, 'H'], [2, 7, 'H'], [2, 8, 'H'], [5, 1, 'H'], [6, 1, 'h'], [5, 10, 'H'], [6, 10, 'h']],
    costas: [[2, 3, 'H'], [2, 4, 'H'], [2, 5, 'H'], [2, 6, 'H'], [2, 7, 'H'], [2, 8, 'H'], [5, 1, 'H'], [6, 1, 'h'], [5, 10, 'H'], [6, 10, 'h']],
    lado: [[2, 3, 'H'], [2, 4, 'H'], [2, 5, 'H'], [2, 6, 'H'], [2, 7, 'H'], [2, 8, 'H'], [5, 4, 'H'], [5, 5, 'H'], [6, 4, 'h'], [6, 5, 'h']],
  };

  function mapaPessoa(pose, quadro, estilo, principal, regata) {
    const def = POSES[pose];
    let cabeca = CABECAS[def.vista][estilo];
    if (def.piscar && quadro === 1) cabeca = cabeca.map((l) => l.replace(/E/g, 's'));
    let linhas = [...cabeca, ...def.corpos[quadro]];
    if (regata) {
      linhas = linhas.map((linha, y) => {
        if (y < 10 || y > 15) return linha;
        const chars = linha.split('');
        if (def.vista === 'frente' || def.vista === 'costas') {
          if (chars[1] === 'T' || chars[1] === 't') chars[1] = 'S';
          if (chars[2] === 'T' || chars[2] === 't') chars[2] = 'S';
          if (chars[3] === 't') chars[3] = 's';
          if (chars[8] === 't') chars[8] = 's';
          if (chars[9] === 'T' || chars[9] === 't') chars[9] = 'S';
          if (chars[10] === 'T' || chars[10] === 't') chars[10] = 'S';
        } else if (def.vista === 'lado') {
          if (chars[4] === 'T' || chars[4] === 't') chars[4] = 'S';
          if (chars[5] === 'T' || chars[5] === 't') chars[5] = 's';
        }
        return chars.join('');
      });
    }
    if (principal) {
      linhas = linhas.map((l) => l.split(''));
      FONE[def.vista].forEach(([r, c, ch]) => {
        if (linhas[r][c] !== '.') linhas[r][c] = ch;
      });
      linhas = linhas.map((l) => l.join(''));
    }
    return linhas;
  }

  const COR_FIXA = { O: '#1A1520', E: '#1A1520', B: '#15121A', H: '#9B5CFF', h: '#5B2BB0' };
  const CLASSE_VAR = { S: 'pp-pele', s: 'pp-pele-s', R: 'pp-cabelo', r: 'pp-cabelo-s', T: 'pp-camisa', t: 'pp-camisa-s', P: 'pp-calca' };

  // Aparências: peles, cabelos e roupas sob medida
  const PELES = [['#F2D3B3', '#D9B08F'], ['#E0B48C', '#C2946C'], ['#C68B5E', '#A66F45'], ['#8D5A3B', '#714629'], ['#5E3A25', '#4A2C1B']];
  const CABELOS = [['#2B1D14', '#1B120C'], ['#5A3A22', '#432A17'], ['#A0652E', '#7F4E22'], ['#D9A441', '#B5852D'], ['#24222C', '#141219'], ['#BDB8C9', '#9893A8'], ['#8B4FD9', '#6B36B5']];
  const CAMISAS = [['#4A5878', '#36415A'], ['#2F6F73', '#225558'], ['#7A3B5E', '#5E2C48'], ['#5B4690', '#45356E'], ['#7A5A34', '#5E4426'], ['#5A5A66', '#45454F'], ['#B9B2A2', '#958F80'], ['#3A3F58', '#2B2F43']];
  const CALCAS = ['#2A2733', '#33384A', '#3A2E28', '#26303A', '#4A4458'];

  // Cores personalizadas conforme especificação
  const PELE_PALIDA = ['#FFF5ED', '#F3D9CB']; // Duda: a mais pálida de todas
  const PELE_CLARA = ['#F5D6B8', '#DDB594'];  // Clara tradicional
  const PELE_PARDA = ['#CEA079', '#B3825C'];  // Luis: levemente pardo
  const PELE_ESCURA = ['#543520', '#3E2415']; // Pedro: pele escura

  const CABELO_BRANCO = ['#FFFFFF', '#D2CFDE']; // Juliano: cabelo branco
  const CABELO_PRETO = ['#18151E', '#0D0B12'];  // Luis e Pedro: cabelo preto
  const CABELO_VERMELHO = ['#E53935', '#B71C1C']; // Duda: cabelo vermelho
  const CABELO_CASTANHO = ['#5D4037', '#3E2723']; // Gabriel: cabelo castanho
  const CABELO_AZUL = ['#1E88E5', '#1565C0'];    // Yago: cabelo azul
  const CABELO_LOIRO = ['#FDD835', '#C0A020'];   // Gislaine: loira

  function hash(texto) {
    let h = 2166136261;
    for (let i = 0; i < texto.length; i += 1) {
      h ^= texto.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  /* Equipe fixa oficial da FG Software */
  /* Equipe fixa oficial da FGSOFT Operations Room */
  const APARÊNCIAS_FIXAS = {
    'principal': { estilo: 'curto', pele: PELE_CLARA, cabelo: CABELO_BRANCO, camisa: CAMISAS[3], calca: CALCAS[0], principal: true, regata: false }, // Juliano - Tech Lead
    'antigravity-core': { estilo: 'curto', pele: PELE_CLARA, cabelo: CABELO_BRANCO, camisa: CAMISAS[3], calca: CALCAS[0], principal: true, regata: false },
    'architect-pm': { estilo: 'curto', pele: PELE_PARDA, cabelo: CABELO_PRETO, camisa: CAMISAS[0], calca: CALCAS[1], principal: false, regata: false }, // Luis - Arquitech
    'qa-auditor': { estilo: 'longo', pele: PELE_PALIDA, cabelo: CABELO_VERMELHO, camisa: CAMISAS[1], calca: CALCAS[4], principal: false, regata: false }, // Duda - Q&A
    'guardian-sre': { estilo: 'cacheado', pele: PELE_CLARA, cabelo: CABELO_CASTANHO, camisa: CAMISAS[5], calca: CALCAS[3], principal: false, regata: false }, // Gabriel - Infra
    'sdr-prospector': { estilo: 'curto', pele: PELE_CLARA, cabelo: CABELO_AZUL, camisa: ['#222129', '#15141A'], calca: CALCAS[2], principal: false, regata: true }, // Yago - Leads (de regata!)
    'chatbot-engine': { estilo: 'curto', pele: PELE_ESCURA, cabelo: CABELO_PRETO, camisa: CAMISAS[7], calca: CALCAS[0], principal: false, regata: false }, // Pedro - ChatBot
    'data-dba': { estilo: 'coque', pele: PELE_CLARA, cabelo: CABELO_LOIRO, camisa: CAMISAS[2], calca: CALCAS[4], principal: false, regata: false }, // Gislaine - DBA
    'dba-architect': { estilo: 'coque', pele: PELE_CLARA, cabelo: CABELO_LOIRO, camisa: CAMISAS[2], calca: CALCAS[4], principal: false, regata: false },
    'cybersec': { estilo: 'curto', pele: PELE_PARDA, cabelo: CABELO_PRETO, camisa: ['#1E293B', '#0F172A'], calca: ['#0F172A', '#020617'], principal: false, regata: false }, // Daniel - Cybersec
    'cybersec-guardian': { estilo: 'curto', pele: PELE_PARDA, cabelo: CABELO_PRETO, camisa: ['#1E293B', '#0F172A'], calca: ['#0F172A', '#020617'], principal: false, regata: false },
    'jarvis': { estilo: 'curto', pele: ['#E0F2FE', '#BAE6FD'], cabelo: ['#38BDF8', '#0284C7'], camisa: ['#0369A1', '#075985'], calca: ['#0C4A6E', '#082F49'], principal: true, regata: false }, // J.A.R.V.I.S. Core
    'jarvis-core': { estilo: 'curto', pele: ['#E0F2FE', '#BAE6FD'], cabelo: ['#38BDF8', '#0284C7'], camisa: ['#0369A1', '#075985'], calca: ['#0C4A6E', '#082F49'], principal: true, regata: false },
  };

  function aparencia(e) {
    const cargo = e.tipo_agente || e.tipo || e.agent_id;
    if (APARÊNCIAS_FIXAS[cargo]) return APARÊNCIAS_FIXAS[cargo];
    const h = hash(`${e.session_id || ''}|${e.agent_id || ''}|${e.id}`);
    const pega = (lista, n) => lista[Math.floor(h / n) % lista.length];
    return {
      estilo: pega(ESTILOS, 1),
      pele: pega(PELES, 5),
      cabelo: pega(CABELOS, 31),
      camisa: pega(CAMISAS, 223),
      calca: pega(CALCAS, 2003),
      principal: e.tipo_agente === 'principal' || e.tipo_agente === 'antigravity-core',
      regata: false,
    };
  }

  /* Mapa de caracteres -> um path por cor, juntando corridas horizontais. */
  function compilar(linhas) {
    const porCor = new Map();
    linhas.forEach((linha, y) => {
      let x = 0;
      while (x < linha.length) {
        const ch = linha[x];
        if (ch === '.') {
          x += 1;
          continue;
        }
        let fim = x + 1;
        while (fim < linha.length && linha[fim] === ch) fim += 1;
        if (!porCor.has(ch)) porCor.set(ch, []);
        porCor.get(ch).push(`M${x} ${y}h${fim - x}v1h-${fim - x}z`);
        x = fim;
      }
    });
    return [...porCor.entries()].map(([ch, partes]) => ({
      ch,
      cor: COR_FIXA[ch] || null,
      classe: CLASSE_VAR[ch] || null,
      d: partes.join(''),
    }));
  }

  /* ----------------------------------------------------------- planta */

  /* Coordenadas em pixels de arte. A sala ocupa a largura toda da cena. */
  const X = {
    techlead: [2, 70],     // Sala privativa do Tech Lead (Juliano)
    div0: [70, 73],       // Divisória acústica envidraçada
    trabalho: [73, 206],  // Open space Dev Studio (7 especialistas + JARVIS)
    div1: [206, 209],     // Divisória com passagens
    cafe: [209, 276],     // Cafeteria & Copa Gourmet
    div2: [276, 279],     // Divisória com passagens
    estar: [279, 342],    // Lounge & Descompressão
    div3: [342, 345],     // Divisória com porta privativa
    banheiro: [345, 378], // Banheiro Corporativo / Lavabo (WC)
  };
  const Y_PISO = 32;
  const MESAS_DEV_X = [96, 139, 182];
  const CAFE_X = [228, 258];
  const ESTAR_X = [296, 326];
  const FOLGA = { x: 4, y: 2 }; // meia largura dos pés: a rota não raspa nos móveis

  function planejarSala(contagem, largura) {
    const W = Math.max(380, Math.floor(largura / P));
    const H = 188; // Altura expandida verticalmente para visual amplo e agradável
    const vagas = [];
    const moveis = [];
    const obst = [];

    // 1. Sala Privativa do Tech Lead (Juliano) & Estação J.A.R.V.I.S.
    const tlX = 36;
    const tlY = 54;
    vagas.push({ id: 'mesa-techlead', zona: 'mesa', tipo: 'mesa', x: tlX, y: tlY + 22, acesso: { x: tlX, y: tlY + 31 } });
    moveis.push({ tipo: 'mesa-techlead', id: 'mesa-techlead', x: tlX, y: tlY });
    obst.push([tlX - 16, tlY - 1, 32, 12], [tlX - 6, tlY + 13, 13, 8]);
    obst.push([6, H - 18, 9, 12]); // planta da sala executiva

    // Estação Central J.A.R.V.I.S. (Instalada no espaço vago da sala do Tech Lead)
    const jX = 36;
    const jY = 130;
    vagas.push({ id: 'mesa-jarvis', zona: 'mesa', tipo: 'mesa', x: jX, y: jY + 22, acesso: { x: jX, y: jY + 31 } });
    moveis.push({ tipo: 'mesa-jarvis', id: 'mesa-jarvis', x: jX, y: jY });
    obst.push([jX - 16, jY - 1, 32, 12], [jX - 6, jY + 13, 13, 8]);

    // 2. Open Space Dev Studio (Luis, Duda, Gabriel, Yago, Pedro, Gislaine, Daniel)
    // 3 fileiras confortáveis de estações de trabalho
    [44, 92, 140].forEach((yT, r) => {
      MESAS_DEV_X.forEach((cx, i) => {
        const id = `mesa-${r * 3 + i}`;
        vagas.push({ id, zona: 'mesa', tipo: 'mesa', x: cx, y: yT + 22, acesso: { x: cx, y: yT + 31 } });
        moveis.push({ tipo: 'mesa', id, x: cx, y: yT });
        obst.push([cx - 14, yT - 1, 28, 11], [cx - 6, yT + 13, 13, 8]);
      });
    });

    // 3. Cafeteria & Copa Gourmet
    vagas.push({ id: 'balcao-0', zona: 'cafe', tipo: 'balcao', x: 228, y: 54, acesso: { x: 228, y: 54 } });
    vagas.push({ id: 'balcao-1', zona: 'cafe', tipo: 'balcao', x: 258, y: 54, acesso: { x: 258, y: 54 } });
    obst.push([211, Y_PISO, 65, 13]); // balcão com cafeteira, micro-ondas, geladeira

    const ytCafe = 104;
    vagas.push({ id: 'banqueta-0', zona: 'cafe', tipo: 'banqueta', x: 232, y: ytCafe + 22, acesso: { x: 232, y: ytCafe + 29 } });
    vagas.push({ id: 'banqueta-1', zona: 'cafe', tipo: 'banqueta', x: 252, y: ytCafe + 22, acesso: { x: 252, y: ytCafe + 29 } });
    moveis.push({ tipo: 'mesinha', x: 242, y: ytCafe });
    obst.push([235, ytCafe, 15, 9], [238, ytCafe + 16, 9, 6]);

    // 4. Lounge & Sala de Descompressão
    const ySofa = 64;
    moveis.push({ tipo: 'sofa', y: ySofa });
    obst.push([284, ySofa - 21, 54, 19]);
    vagas.push({ id: 'estar-0', zona: 'estar', tipo: 'sofa', x: 295, y: ySofa, acesso: { x: 295, y: ySofa + 9 } });
    vagas.push({ id: 'estar-1', zona: 'estar', tipo: 'sofa', x: 325, y: ySofa, acesso: { x: 325, y: ySofa + 9 } });

    const yPoltrona = 124;
    moveis.push({ tipo: 'poltronas', y: yPoltrona });
    obst.push([284, yPoltrona - 21, 54, 19]);
    vagas.push({ id: 'estar-2', zona: 'estar', tipo: 'sofa', x: 310, y: yPoltrona, acesso: { x: 310, y: yPoltrona + 9 } });

    // 5. Banheiro Corporativo / Lavabo (WC com privada de porcelana abaixo da porta)
    obst.push([348, Y_PISO, 26, 12]); // bancada da pia / espelho
    obst.push([354, 118, 18, 22]);     // Privada / Vaso sanitário de porcelana
    obst.push([353, 68, 18, 16]);     // CAIXA DE AREIA DOS GATOS (OBSTÁCULO TOTAL: HUMANOS NUNCA PISAM AQUI!)
    vagas.push({ id: 'banheiro-0', zona: 'banheiro', tipo: 'balcao', x: 362, y: 44, acesso: { x: 362, y: 48 } }); // Pia para lavar as mãos
    vagas.push({ id: 'banheiro-privada', zona: 'banheiro', tipo: 'balcao', x: 362, y: 136, acesso: { x: 362, y: 148 } }); // Vaso sanitário / Privada

    // Paredes perimetrais
    obst.push([0, 0, W, Y_PISO], [0, 0, 2, H], [W - 2, 0, 2, H], [0, H - 3, W, 3]);

    // Divisórias internas com passagens confortáveis
    const passagens = {
      div0: [[60, 94]],
      div1: [[56, 84], [116, 154]],
      div2: [[56, 84], [116, 154]],
      div3: [[60, 94]]
    };

    const divs = [
      { x: X.div0, p: passagens.div0 },
      { x: X.div1, p: passagens.div1 },
      { x: X.div2, p: passagens.div2 },
      { x: X.div3, p: passagens.div3 }
    ];

    divs.forEach(({ x: [x0, x1], p: passList }) => {
      let y = Y_PISO;
      passList.forEach(([p0, p1]) => {
        if (p0 > y) obst.push([x0, y, x1 - x0, p0 - y]);
        y = p1;
      });
      if (H - 3 > y) obst.push([x0, y, x1 - x0, H - 3 - y]);
    });

    return {
      W, H, largura: W * P, altura: H * P,
      linhasMesa: 3, linhasCafe: 1, linhasEstar: 2,
      assinatura: `${W}:${H}:completo`,
      vagas, moveis, obstaculos: obst, passagens
    };
  }

  /* --------------------------------------------------------- circulação */

  const CEL = 2; // célula da grade, em pixels de arte

  function criarGrade(plano) {
    const cw = Math.ceil(plano.W / CEL);
    const ch = Math.ceil(plano.H / CEL);
    const livre = new Uint8Array(cw * ch).fill(1);
    plano.obstaculos.forEach(([x, y, w, h]) => {
      const x0 = Math.max(0, Math.floor((x - FOLGA.x) / CEL));
      const x1 = Math.min(cw - 1, Math.floor((x + w + FOLGA.x - 0.01) / CEL));
      const y0 = Math.max(0, Math.floor((y - FOLGA.y) / CEL));
      const y1 = Math.min(ch - 1, Math.floor((y + h + FOLGA.y - 0.01) / CEL));
      for (let cy = y0; cy <= y1; cy += 1) for (let cx = x0; cx <= x1; cx += 1) livre[cy * cw + cx] = 0;
    });
    return { cw, ch, livre };
  }

  const celula = (grade, p) => ({
    cx: Math.min(grade.cw - 1, Math.max(0, Math.floor(p.x / CEL))),
    cy: Math.min(grade.ch - 1, Math.max(0, Math.floor(p.y / CEL))),
  });

  /* célula livre mais perto (quem está sentado parte de dentro do móvel) */
  function livreMaisPerto(grade, c) {
    if (grade.livre[c.cy * grade.cw + c.cx]) return c;
    for (let raio = 1; raio < 20; raio += 1) {
      for (let dy = -raio; dy <= raio; dy += 1) {
        for (let dx = -raio; dx <= raio; dx += 1) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== raio) continue;
          const cx = c.cx + dx;
          const cy = c.cy + dy;
          if (cx >= 0 && cy >= 0 && cx < grade.cw && cy < grade.ch && grade.livre[cy * grade.cw + cx]) return { cx, cy };
        }
      }
    }
    return null;
  }

  /* A* em 4 direções. Devolve os cantos do caminho em pixels de arte (sem
     os pontos intermediários de cada reta), ou null se não há passagem. */
  function rota(grade, de, para) {
    const a = livreMaisPerto(grade, celula(grade, de));
    const b = livreMaisPerto(grade, celula(grade, para));
    if (!a || !b) return null;
    const { cw, ch, livre } = grade;
    const n = cw * ch;
    const g = new Float64Array(n).fill(Infinity);
    const veio = new Int32Array(n).fill(-1);
    const fechado = new Uint8Array(n);
    const ini = a.cy * cw + a.cx;
    const fim = b.cy * cw + b.cx;
    const h = (i) => Math.abs((i % cw) - b.cx) + Math.abs(Math.floor(i / cw) - b.cy);
    const heap = [];
    const empurra = (i, f) => {
      heap.push([f, i]);
      let k = heap.length - 1;
      while (k > 0) {
        const pai = (k - 1) >> 1;
        if (heap[pai][0] <= heap[k][0]) break;
        [heap[pai], heap[k]] = [heap[k], heap[pai]];
        k = pai;
      }
    };
    const tira = () => {
      const topo = heap[0];
      const ultimo = heap.pop();
      if (heap.length) {
        heap[0] = ultimo;
        let k = 0;
        for (;;) {
          const e = 2 * k + 1;
          const d = e + 1;
          let m = k;
          if (e < heap.length && heap[e][0] < heap[m][0]) m = e;
          if (d < heap.length && heap[d][0] < heap[m][0]) m = d;
          if (m === k) break;
          [heap[m], heap[k]] = [heap[k], heap[m]];
          k = m;
        }
      }
      return topo;
    };
    g[ini] = 0;
    empurra(ini, h(ini));
    while (heap.length) {
      const [, i] = tira();
      if (fechado[i]) continue;
      if (i === fim) break;
      fechado[i] = 1;
      const x = i % cw;
      const y = Math.floor(i / cw);
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dy]) => {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= cw || ny >= ch) return;
        const j = ny * cw + nx;
        if (!livre[j] || fechado[j]) return;
        // curva custa um pouco: rotas com poucos cantos, como gente anda
        const curva = veio[i] !== -1 && (veio[i] % cw !== x ? dy !== 0 : dx !== 0) ? 0.4 : 0;
        const custo = g[i] + 1 + curva;
        if (custo < g[j]) {
          g[j] = custo;
          veio[j] = i;
          empurra(j, custo + h(j));
        }
      });
    }
    if (ini !== fim && veio[fim] === -1) return null;
    const celulas = [];
    for (let i = fim; i !== -1; i = veio[i]) {
      celulas.push(i);
      if (i === ini) break;
    }
    celulas.reverse();
    const pontos = celulas.map((i) => ({ x: (i % cw) * CEL + CEL / 2, y: Math.floor(i / cw) * CEL + CEL / 2 }));
    const cantos = [];
    pontos.forEach((p, k) => {
      const ant = pontos[k - 1];
      const prox = pontos[k + 1];
      if (!ant || !prox || (ant.x === p.x) !== (p.x === prox.x)) cantos.push(p);
    });
    return cantos;
  }

  /* Peso de cada área por estado. Lugar é ambientação, mas a cena não pode
     desmentir o estado: quem trabalha senta na mesa; quem está aguardando,
     concluiu ou está órfão circula pela convivência (café/sofá) e NUNCA senta na mesa. */
  const PESOS = {
    trabalhando: { mesa: 1 },
    delegando: { mesa: 1 },
    aguardando: { cafe: 0.45, estar: 0.45, banheiro: 0.1 },
    concluida: { cafe: 0.45, estar: 0.55 },
    orfa: { cafe: 0.3, estar: 0.7 },
  };
  const PESOS_MESA = { trabalhando: { mesa: 1 }, delegando: { mesa: 1 } };
  let focoMesa = false;
  const pesosDe = (status) => (focoMesa && PESOS_MESA[status]) || PESOS[status] || PESOS.aguardando;

  function sortearZona(status, sorteio) {
    const pesos = pesosDe(status);
    let s = sorteio * Object.values(pesos).reduce((a, b) => a + b, 0);
    for (const [zona, peso] of Object.entries(pesos)) {
      s -= peso;
      if (s <= 0) return zona;
    }
    return Object.keys(pesos).pop();
  }

  const MESAS_DESIGNADAS = {
    'principal': 'mesa-techlead',
    'antigravity-core': 'mesa-techlead',
    'architect-pm': 'mesa-0',
    'qa-auditor': 'mesa-1',
    'guardian-sre': 'mesa-2',
    'sdr-prospector': 'mesa-3',
    'chatbot-engine': 'mesa-4',
    'data-dba': 'mesa-5',
    'dba-architect': 'mesa-5',
    'cybersec': 'mesa-6',
    'cybersec-guardian': 'mesa-6',
    'jarvis': 'mesa-jarvis',
    'jarvis-core': 'mesa-jarvis',
  };

  /* Uma vaga livre para o status. Quem trabalha vai direto para sua mesa fixa designada. */
  function escolherVaga(plano, status, ocupadas, sorteio, atual, cargo) {
    if (['trabalhando', 'delegando'].includes(status)) {
      const mesaDesignadaId = cargo && MESAS_DESIGNADAS[cargo];
      if (mesaDesignadaId) {
        const mesa = plano.vagas.find((v) => v.id === mesaDesignadaId);
        if (mesa) return mesa;
      }
      const mesaLivre = plano.vagas.find((v) => v.zona === 'mesa' && !ocupadas.has(v.id));
      if (mesaLivre) return mesaLivre;
    }
    const pesos = pesosDe(status);
    const primeira = sortearZona(status, sorteio);
    const ordem = [primeira, ...Object.keys(pesos).filter((z) => z !== primeira).sort((a, b) => pesos[b] - pesos[a])];
    for (const zona of ordem) {
      const livres = plano.vagas.filter((v) => v.zona === zona && !ocupadas.has(v.id) && v.id !== atual);
      if (livres.length) return livres[Math.floor(((sorteio * 7919) % 1) * livres.length)];
    }
    return null;
  }

  /* Do payload da API para a lista de salas da cena: só salas com alguém,
     ordem estável por nome, "Sem projeto" por último (mesma regra do
     Escritório vetorial). */
  function prepararSalas(dados) {
    const salas = (dados.salas || [])
      .filter((s) => (s.execucoes || []).length)
      .map((s) => ({
        chave: s.chave,
        nome: s.nome,
        projeto_id: s.projeto_id,
        cwd: s.cwd,
        execucoes: s.execucoes,
        ativos: Number.isInteger(s.ativos) ? s.ativos : s.execucoes.filter((e) => ATIVOS.includes(e.status)).length,
      }));
    salas.sort((a, b) => {
      if (!a.projeto_id !== !b.projeto_id) return a.projeto_id ? -1 : 1;
      return a.nome.localeCompare(b.nome, 'pt-BR');
    });
    return salas;
  }

  /* -------------------------------------------------------- pintura */

  function criarPintor() {
    const camadas = [];
    return {
      r(x, y, w, h, cor) {
        if (w <= 0 || h <= 0) return;
        const ultima = camadas[camadas.length - 1];
        const camada = ultima && ultima.cor === cor ? ultima : { cor, partes: [] };
        if (camada !== ultima) camadas.push(camada);
        camada.partes.push(`M${x} ${y}h${w}v${h}h-${w}z`);
      },
      saida: () => camadas.map((c) => ({ cor: c.cor, d: c.partes.join('') })),
    };
  }

  const LIVROS = ['#7D36EC', '#E0409A', '#4F7BD9', '#2FA36B', '#D99A2B', '#A469FF', '#6B6B75', '#B347D0'];

  function pintarSala(plano) {
    const p = criarPintor();
    const r = p.r;
    const { W, H } = plano;

    // Cabeçalho da sala
    r(0, 0, W, 16, '#111017');
    r(0, 15, W, 1, '#26232F');

    // Pisos dos ambientes
    // 1. Tech Lead (Madeira nobre mogno executiva)
    r(X.techlead[0], Y_PISO, X.techlead[1] - X.techlead[0], H - Y_PISO, '#241C28');
    for (let y = Y_PISO + 5; y < H; y += 5) r(X.techlead[0], y, X.techlead[1] - X.techlead[0], 1, '#1E1622');

    // 2. Dev Studio (Vinílico técnico grafite com réguas)
    r(X.trabalho[0], Y_PISO, X.trabalho[1] - X.trabalho[0], H - Y_PISO, '#262030');
    for (let y = Y_PISO + 5; y < H; y += 5) r(X.trabalho[0], y, X.trabalho[1] - X.trabalho[0], 1, '#201A28');
    for (let y = Y_PISO, k = 0; y < H; y += 5, k += 1) {
      for (let x = X.trabalho[0] + ((k * 13) % 31); x < X.trabalho[1]; x += 31) r(x, y + 1, 1, 4, '#201A28');
    }

    // 3. Cafeteria (Piso xadrez clássico preto e cinza)
    r(X.cafe[0], Y_PISO, X.cafe[1] - X.cafe[0], H - Y_PISO, '#26222F');
    for (let y = Y_PISO; y < H; y += 6) {
      for (let x = X.cafe[0] + (((y - Y_PISO) / 6) % 2) * 6; x < X.cafe[1]; x += 12) {
        r(x, y, Math.min(6, X.cafe[1] - x), Math.min(6, H - y), '#2E2939');
      }
    }

    // 4. Lounge (Piso e tapete grande índigo/roxo)
    r(X.estar[0], Y_PISO, X.estar[1] - X.estar[0], H - Y_PISO, '#262030');
    r(X.estar[0] + 3, Y_PISO + 4, X.estar[1] - X.estar[0] - 6, H - Y_PISO - 10, '#3A2D5C');
    r(X.estar[0] + 4, Y_PISO + 5, X.estar[1] - X.estar[0] - 8, H - Y_PISO - 12, '#2A2142');

    // 5. Banheiro (Azulejos claros e limpos)
    r(X.banheiro[0], Y_PISO, X.banheiro[1] - X.banheiro[0], H - Y_PISO, '#383542');
    for (let y = Y_PISO + 4; y < H; y += 4) r(X.banheiro[0], y, X.banheiro[1] - X.banheiro[0], 1, '#444052');
    for (let x = X.banheiro[0] + 4; x < X.banheiro[1]; x += 4) r(x, Y_PISO, 1, H - Y_PISO, '#444052');

    r(2, Y_PISO, W - 4, 1, '#0F0E14'); // sombra da parede no piso

    // Parede do fundo (com rodapé e neon)
    r(0, 16, W, 1, '#3A3550');
    r(0, 17, W, 12, '#1F1C29');
    r(0, 29, W, 1, '#1A1823');
    r(0, 30, W, 1, '#E42E2E');
    r(0, 31, W, 1, '#100F15');

    // A. Tech Lead: Placa executiva, estante de livros, troféu
    r(14, 18, 42, 10, '#0D0C12');
    r(15, 19, 40, 8, '#261D2E');
    r(18, 21, 34, 1, '#E42E2E');
    r(18, 23, 20, 1, '#ff6b6b');
    r(18, 25, 26, 1, '#E0409A');
    r(45, 22, 6, 4, '#F5C66B');

    // B. Dev Studio: Kanban whiteboard com post-its e Servidor Rack
    r(85, 18, 48, 11, '#0D0C12');
    r(86, 19, 46, 9, '#E6E3F0');
    r(89, 21, 14, 1, '#E42E2E');
    r(89, 23, 18, 1, '#4F7BD9');
    r(89, 25, 12, 1, '#E0409A');
    r(112, 21, 9, 6, '#C9C3DA');
    r(86, 28, 46, 1, '#8F8A9E');

    // Relógio dev
    r(144, 18, 6, 6, '#0D0C12');
    r(145, 19, 4, 4, '#E6E3F0');
    r(146, 20, 1, 2, '#0D0C12');

    // Servidor Rack & J.A.R.V.I.S. Mainframe no canto dev com LEDs
    r(172, 17, 28, 13, '#0D0C12');
    r(173, 18, 26, 11, '#1E1B26');
    for (let y = 19; y <= 27; y += 2) {
      r(175, y, 16, 1, '#3A3550');
      r(193, y, 1, 1, y % 4 === 0 ? '#22C55E' : '#38BDF8');
      r(195, y, 1, 1, '#E42E2E');
    }
    // Holograma J.A.R.V.I.S. Reactor no topo do Rack
    r(178, 20, 10, 5, '#0369A1');
    r(179, 21, 8, 3, '#38BDF8');
    r(182, 22, 2, 1, '#FFFFFF');

    // C. Cafeteria: Armário alto, balcão, cafeteira, micro-ondas, geladeira inox
    r(212, 18, 44, 7, '#0D0C12');
    r(213, 18, 42, 6, '#3A3448');
    for (let x = 222; x < 254; x += 10) r(x, 18, 1, 6, '#2A2633');
    r(212, Y_PISO - 1, 46, 14, '#0D0C12');
    r(213, Y_PISO, 44, 8, '#4A4458');
    r(213, Y_PISO, 44, 1, '#5E576E');
    r(213, Y_PISO + 8, 44, 4, '#2E2A3B');
    // Cafeteira expresso
    r(216, 25, 9, 12, '#0D0C12');
    r(217, 26, 7, 10, '#3B3648');
    r(218, 28, 5, 2, '#D99A2B');
    r(219, 33, 3, 2, '#EAEAF0');
    r(228, 35, 2, 2, '#EAEAF0');
    r(231, 35, 2, 2, '#E0409A');
    // Micro-ondas
    r(236, 27, 13, 10, '#0D0C12');
    r(237, 28, 11, 8, '#2E2A3B');
    r(238, 29, 7, 6, '#14131A');
    r(246, 30, 1, 3, '#2FA36B');
    // Geladeira Inox Alta
    r(260, 19, 14, 27, '#0D0C12');
    r(261, 20, 12, 25, '#C9C6D6');
    r(261, 20, 12, 1, '#E6E3F0');
    r(261, 31, 12, 1, '#8F8A9E');
    r(271, 24, 1, 4, '#5A5A66');
    r(271, 35, 1, 5, '#5A5A66');
    // Tigelinhas dos gatos (água e comida)
    r(220, 42, 6, 3, '#4F7BD9');
    r(221, 43, 4, 1, '#7EB2FF');
    r(228, 42, 6, 3, '#D99A2B');
    r(229, 43, 4, 1, '#7A5016');

    // D. Lounge: Janela panorâmica com cidade noturna
    const wx = 284;
    r(wx - 1, 17, 54, 13, '#0D0C12');
    r(wx, 18, 52, 11, '#3A3448');
    ['#1D1440', '#26194F', '#31205E', '#40256A', '#552A72', '#6E2D74', '#7E3075', '#8E3576', '#9C3A78'].forEach((cor, i) => r(wx + 1, 19 + i, 50, 1, cor));
    r(wx + 42, 20, 3, 3, '#F3E9C6');
    const alturas = [4, 7, 3, 6, 8, 4, 6, 3, 5, 7, 4, 6, 3, 8, 5, 4, 7];
    alturas.forEach((a, i) => r(wx + 1 + i * 3, 28 - a, 3, a, '#0E0B1A'));
    for (let i = 0; i < alturas.length; i += 1) {
      if (alturas[i] > 4 && i % 2 === 0) r(wx + 2 + i * 3, 28 - alturas[i] + 2, 1, 1, i % 3 === 0 ? '#F5C66B' : '#ff6b6b');
    }
    r(wx + 26, 19, 1, 9, '#3A3448');
    r(wx - 1, 29, 54, 1, '#4A4459');

    // E. Banheiro: Espelho, pia, cabine com porta
    r(350, 18, 24, 11, '#0D0C12');
    r(351, 19, 22, 9, '#A5B4C8');
    r(351, 19, 22, 1, '#D8E2EC');
    r(350, 29, 24, 1, '#3A3550');
    // Pia
    r(352, Y_PISO, 20, 9, '#0D0C12');
    r(353, Y_PISO + 1, 18, 7, '#E2E8F0');
    r(360, Y_PISO - 2, 3, 3, '#CBD5E1');
    // Caixa de areia dos gatos com pazinha (afastada e isolada para os gatos)
    r(354, 70, 16, 12, '#0D0C12');
    r(355, 71, 14, 10, '#E42E2E');
    r(356, 72, 12, 8, '#E5D3B3');
    r(358, 74, 2, 1, '#C7B18E');
    r(363, 76, 3, 1, '#C7B18E');
    r(368, 69, 2, 7, '#4F7BD9');
    r(368, 75, 3, 2, '#4F7BD9');
    // Privada de porcelana branca (vaso sanitário visível abaixo da porta do banheiro)
    // Divisória lateral e batente
    r(346, 110, 1, 38, '#4A4459');
    r(346, 110, 16, 1, '#4A4459');
    // Caixa acoplada encostada na parede
    r(356, 118, 14, 7, '#0D0C12');
    r(357, 119, 12, 5, '#FFFFFF');
    r(357, 119, 12, 1, '#E2E8F0');
    r(362, 120, 2, 2, '#94A3B8'); // Botão de descarga cromado
    // Vaso sanitário / Louça de porcelana
    r(357, 125, 12, 14, '#0D0C12');
    r(358, 126, 10, 12, '#FFFFFF');
    r(359, 128, 8, 8, '#E2E8F0'); // profundidade do assento
    r(360, 130, 6, 5, '#CBD5E1');
    r(361, 131, 4, 3, '#7DD3FC'); // reflexo de água limpa
    // Base no piso
    r(359, 139, 8, 3, '#0D0C12');
    r(360, 139, 6, 2, '#E2E8F0');
    // Suporte de papel higiênico na parede direita
    r(372, 124, 3, 5, '#0D0C12');
    r(372, 124, 3, 4, '#FFFFFF');
    r(371, 123, 4, 1, '#64748B');
    // Lixeirinha inox com pedal
    r(348, 132, 5, 8, '#0D0C12');
    r(349, 133, 4, 6, '#94A3B8');
    r(349, 132, 4, 1, '#CBD5E1');
    r(349, 138, 2, 1, '#0D0C12');
    // Tapete higiênico no chão
    r(356, 143, 14, 4, '#241F30');
    r(357, 144, 12, 2, '#38304A');

    // Divisórias internas com passagens
    const divs = [
      { x0: X.div0[0], x1: X.div0[1], p: plano.passagens.div0, vidro: true },
      { x0: X.div1[0], x1: X.div1[1], p: plano.passagens.div1, vidro: false },
      { x0: X.div2[0], x1: X.div2[1], p: plano.passagens.div2, vidro: false },
      { x0: X.div3[0], x1: X.div3[1], p: plano.passagens.div3, vidro: false },
    ];

    divs.forEach(({ x0, x1, p: passList, vidro }) => {
      let y = Y_PISO;
      const trecho = (a, b) => {
        r(x0, a, x1 - x0, b - a, vidro ? '#252033' : '#2E2A3B');
        r(x0, a, 1, b - a, vidro ? '#E42E2E' : '#3A3550');
        r(x0, b - 1, x1 - x0, 1, '#4A4459');
      };
      passList.forEach(([p0, p1]) => {
        if (p0 > y) trecho(y, p0);
        y = p1;
      });
      if (H - 3 > y) trecho(y, H - 3);
    });

    // Paredes perimetrais
    r(0, 16, 2, H - 16, '#2E2A3B');
    r(W - 2, 16, 2, H - 16, '#2E2A3B');
    r(0, H - 3, W, 3, '#2E2A3B');
    r(0, H - 3, W, 1, '#3A3550');

    // Planta executiva na sala do Tech Lead
    r(6, H - 9, 7, 5, '#0D0C12');
    r(7, H - 9, 5, 4, '#7A5434');
    r(4, H - 16, 11, 7, '#1F6B42');
    r(5, H - 18, 9, 7, '#2F8F5B');
    r(7, H - 20, 5, 4, '#3FAE6E');

    // Móveis dos ambientes
    plano.moveis.forEach((m) => {
      if (m.tipo === 'mesa-techlead') {
        const { x: cx, y: yT } = m;
        // Mesa diretoria executiva em mogno nobre
        r(cx - 16, yT - 1, 32, 12, '#0D0C12');
        r(cx - 15, yT, 30, 8, '#4A3022');
        r(cx - 15, yT, 30, 1, '#5E3D2B');
        r(cx - 15, yT + 8, 30, 2, '#2E1E15');
        // Monitor ultrawide curvo com luz de liderança
        r(cx - 10, yT - 8, 20, 10, '#0D0C12');
        r(cx - 9, yT - 7, 18, 8, '#2E2A3B');
        r(cx - 8, yT - 6, 16, 6, '#14131A');
        // Notebook executivo aberto ao lado
        r(cx + 6, yT + 1, 6, 5, '#0D0C12');
        r(cx + 6, yT + 1, 6, 4, '#C9C6D6');
        // Luminária de mesa
        r(cx - 14, yT - 3, 3, 5, '#F5C66B');
        // Cadeira presidente
        r(cx - 7, yT + 13, 15, 9, '#0D0C12');
        r(cx - 6, yT + 14, 13, 5, '#2A1F30');
        r(cx - 6, yT + 14, 13, 1, '#443350');
        r(cx - 5, yT + 19, 11, 2, '#1E1624');
      } else if (m.tipo === 'mesa-jarvis') {
        const { x: cx, y: yT } = m;
        // Console executivo futurista do J.A.R.V.I.S. (na sala do Tech Lead)
        r(cx - 16, yT - 1, 32, 12, '#0D0C12');
        r(cx - 15, yT, 30, 8, '#0A1128');
        r(cx - 15, yT, 30, 1, '#38BDF8'); // Linha neon ciano
        r(cx - 15, yT + 8, 30, 2, '#001F54');
        // Painel holográfico central e Arc Reactor
        r(cx - 10, yT - 8, 20, 10, '#0D0C12');
        r(cx - 9, yT - 7, 18, 8, '#0369A1');
        r(cx - 8, yT - 6, 16, 6, '#0C4A6E');
        // Núcleo do Arc Reactor pulsante
        r(cx - 3, yT - 5, 6, 4, '#38BDF8');
        r(cx - 1, yT - 4, 2, 2, '#FFFFFF');
        // Projeção holográfica flutuante
        r(cx - 7, yT - 12, 14, 1, '#38BDF8');
        r(cx - 5, yT - 10, 10, 1, '#0284C7');
        // Mini display auxiliar de telemetria
        r(cx + 6, yT + 1, 6, 5, '#0D0C12');
        r(cx + 6, yT + 1, 6, 4, '#38BDF8');
        r(cx + 7, yT + 2, 4, 2, '#082F49');
        // Cadeira executiva de comando tech
        r(cx - 7, yT + 13, 15, 9, '#0D0C12');
        r(cx - 6, yT + 14, 13, 5, '#075985');
        r(cx - 6, yT + 14, 13, 1, '#38BDF8');
        r(cx - 5, yT + 19, 11, 2, '#0C4A6E');
      } else if (m.tipo === 'mesa') {
        const { x: cx, y: yT } = m;
        r(cx - 14, yT - 1, 28, 11, '#0D0C12');
        r(cx - 13, yT, 26, 7, '#3B3648');
        r(cx - 13, yT, 26, 1, '#4D475D');
        r(cx - 13, yT + 7, 26, 2, '#2A2633');
        r(cx - 13, yT + 9, 2, 2, '#1E1B26');
        r(cx + 11, yT + 9, 2, 2, '#1E1B26');
        r(cx - 7, yT - 7, 15, 9, '#0D0C12');
        r(cx - 6, yT - 6, 13, 7, '#2E2A3B');
        r(cx - 5, yT - 5, 11, 5, '#14131A');
        r(cx - 1, yT + 1, 3, 1, '#2E2A3B');
        r(cx - 5, yT + 3, 10, 2, '#1E1B26');
        r(cx - 4, yT + 3, 8, 1, '#2E2A3B');
        r(cx + 7, yT + 3, 2, 2, '#2E2A3B');
        r(cx - 11, yT + 1, 3, 4, '#E42E2E');
        r(cx - 10, yT + 1, 1, 4, '#ff6b6b');
        // Cadeira
        r(cx - 6, yT + 13, 13, 8, '#0D0C12');
        r(cx - 5, yT + 14, 11, 4, '#3A3448');
        r(cx - 5, yT + 14, 11, 1, '#4A4458');
        r(cx - 4, yT + 18, 9, 2, '#2C2838');
      } else if (m.tipo === 'mesinha') {
        const { x, y } = m;
        r(x - 7, y, 15, 8, '#0D0C12');
        r(x - 6, y + 1, 13, 5, '#4A4458');
        r(x - 6, y + 1, 13, 1, '#5E576E');
        r(x - 1, y + 7, 3, 3, '#2A2633');
        r(x - 3, y + 2, 2, 2, '#EAEAF0');
        r(x + 2, y + 2, 2, 2, '#EAEAF0');
        r(x - 4, y + 16, 9, 5, '#0D0C12');
        r(x - 3, y + 16, 7, 3, '#5A4788');
        r(x - 3, y + 16, 7, 1, '#6E5AA0');
      } else if (m.tipo === 'sofa') {
        const ya = m.y;
        r(284, ya - 21, 54, 19, '#0D0C12');
        r(285, ya - 20, 52, 7, '#4C3B74');
        r(285, ya - 20, 52, 1, '#6A55A0');
        r(285, ya - 13, 52, 8, '#3B2D5C');
        r(285, ya - 5, 52, 2, '#2E2346');
      } else if (m.tipo === 'poltronas') {
        const ya = m.y;
        r(284, ya - 21, 54, 19, '#0D0C12');
        r(285, ya - 20, 52, 6, '#7A3B5E');
        r(285, ya - 20, 52, 1, '#9A5279');
        r(285, ya - 14, 52, 9, '#5E2C48');
      }
    });

    return p.saida();
  }

  const logica = {
    P, SW, SH, POSES, ESTILOS, CABECAS, COR_FIXA, CLASSE_VAR, PESOS, X,
    mapaPessoa, aparencia, compilar, planejarSala, criarGrade, rota, sortearZona, escolherVaga,
    prepararSalas, pintarSala, hash,
    definirFocoMesa: (ligado) => { focoMesa = Boolean(ligado); },
  };

  /* ---------------------------------------------------------------- DOM */

  const NS = 'http://www.w3.org/2000/svg';
  const CENA = { largura: 1172, margem: 16 };
  const VELOCIDADE = 26; // pixels de arte por segundo
  const PERMANENCIA = { mesa: [24000, 55000], cafe: [6000, 16000], estar: [8000, 22000], banheiro: [5000, 10000] };
  const PLACA_MAX = 110;
  const ROTULOS = {
    principal: 'Juliano - Tech Lead',
    'antigravity-core': 'Juliano - Tech Lead',
    'architect-pm': 'Luis - Arquitech',
    'qa-auditor': 'Duda - Q&A',
    'guardian-sre': 'Gabriel - Infra',
    'sdr-prospector': 'Yago - Leads',
    'chatbot-engine': 'Pedro - ChatBot',
    'data-dba': 'Gislaine - DBA',
    'dba-architect': 'Gislaine - DBA',
    'cybersec': 'Daniel - Cybersec',
    'cybersec-guardian': 'Daniel - Cybersec',
    'jarvis': 'J.A.R.V.I.S.',
    'jarvis-core': 'J.A.R.V.I.S.',
    desconhecido: 'Especialista'
  };
  const rotulo = (tipo) => ROTULOS[tipo] || tipo || '?';
  const esc = (v) =>
    String(v === null || v === undefined ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const reduzido = () => raiz.matchMedia && raiz.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const FAMILIAS = [
    ['principal', /^(principal|antigravity.*)$/i],
    ['plano', /^(plan|architect.*)$/i],
    ['qa', /^(qa.*|verificador|diagnostico|security)/i],
    ['dados', /^(analista|sdr.*|dba.*|data.*)/i],
    ['conhecimento', /^(guardian.*|curador|radar|entrega)/i],
    ['revisao', /^(revisor|code-review|simplify)/i],
    ['pesquisa', /^(explore|pesquisador|general-purpose|chatbot.*)/i],
  ];
  const familiaDe = (tipo) => (FAMILIAS.find(([, pattern]) => pattern.test(String(tipo || ''))) || ['outro'])[0];
  const GLIFOS = {
    principal: '<path class="glifo cheio" d="M0 -4.2 L1.3 -1.3 L4.2 0 L1.3 1.3 L0 4.2 L-1.3 1.3 L-4.2 0 L-1.3 -1.3 Z"/>',
    pesquisa: '<circle class="glifo" cx="-1.2" cy="-1.2" r="2.7"/><path class="glifo" d="M0.8 0.8 L4 4"/>',
    plano: '<path class="glifo" d="M-4 -3 H4 M-4 0 H2 M-4 3 H3"/>',
    revisao: '<path class="glifo" d="M-4 0.2 L-1.2 3 L4 -3"/>',
    qa: '<path class="glifo" d="M0 -4.4 L3.8 -2.8 V0.4 Q3.8 3.2 0 4.6 Q-3.8 3.2 -3.8 0.4 V-2.8 Z"/>',
    dados: '<path class="glifo" d="M-3.5 4 V0 M0 4 V-4 M3.5 4 V-1.5"/>',
    conhecimento: '<path class="glifo" d="M-4 -3.5 H-0.3 V3.8 H-4 Z M0.3 -3.5 H4 V3.8 H0.3 Z"/>',
  };
  const glifoDe = (tipo) => GLIFOS[familiaDe(tipo)] || `<text class="glifo-letra" y="3.4" text-anchor="middle">${esc(tipo === 'principal' ? 'C' : String(tipo || '?').slice(0, 1).toUpperCase())}</text>`;

  function svgEl(nome, atributos, classe) {
    const el = document.createElementNS(NS, nome);
    Object.entries(atributos || {}).forEach(([k, v]) => el.setAttribute(k, v));
    if (classe) el.setAttribute('class', classe);
    return el;
  }

  let svg = null;
  let defs = null;
  let camadaSalas = null;
  let camadaLinks = null;
  let camadaRota = null;
  let obterHistorico = () => ({});
  let trajetoLigado = () => false;
  const salas = new Map();
  const entidades = new Map();
  const links = new Map();
  const simbolos = new Set();
  let raf = null;
  let ultimoQuadro = 0;
  let timerAgenda = null;

  function montar(container, dados, opcoes) {
    destruir();
    obterHistorico = (opcoes && opcoes.historico) || (() => ({}));
    trajetoLigado = (opcoes && opcoes.trajeto) || (() => false);
    svg = svgEl('svg', { class: 'cena escritorio pixel', viewBox: `0 0 ${CENA.largura} 200`, preserveAspectRatio: 'xMidYMin meet', role: 'img', 'aria-label': 'Escritório dos agentes' });
    defs = svgEl('defs');
    svg.appendChild(defs);
    camadaSalas = svgEl('g', {}, 'camada-salas');
    camadaRota = svgEl('g', {}, 'camada-rota');
    camadaLinks = svgEl('g', {}, 'camada-links');
    svg.appendChild(camadaSalas);
    svg.appendChild(camadaRota);
    svg.appendChild(camadaLinks);
    container.innerHTML = '';
    container.appendChild(svg);
    svg.addEventListener('mouseover', aoPassarMouse);
    svg.addEventListener('mouseout', aoSairMouse);
    timerAgenda = setInterval(agenda, 700);
    focoMesa = Boolean(raiz.location && /[?&]foco=mesa(&|$)/.test(raiz.location.hash || ''));
    atualizar(dados);
    ultimoQuadro = performance.now();
    if (!raf) raf = requestAnimationFrame(tick);
  }

  function destruir() {
    if (timerAgenda) clearInterval(timerAgenda);
    timerAgenda = null;
    if (raf) cancelAnimationFrame(raf);
    raf = null;
    salas.clear();
    entidades.clear();
    links.clear();
    simbolos.clear();
    if (svg && svg.parentNode) svg.parentNode.removeChild(svg);
    svg = null;
  }

  const montado = () => Boolean(svg && svg.isConnected);

  /* ----------------------------------------------------------- símbolos */

  function simbolo(estilo, principal, pose, quadro, regata) {
    const id = `pp-${estilo}-${principal ? 1 : 0}-${regata ? 1 : 0}-${pose}-${quadro}`;
    if (!simbolos.has(id)) {
      simbolos.add(id);
      const s = svgEl('symbol', { id, viewBox: `0 0 ${SW} ${SH}` });
      compilar(mapaPessoa(pose, quadro, estilo, principal, regata)).forEach((c) => {
        const path = svgEl('path', { d: c.d });
        if (c.classe) path.setAttribute('class', c.classe);
        else path.setAttribute('fill', c.cor);
        s.appendChild(path);
      });
      defs.appendChild(s);
    }
    return `#${id}`;
  }

  /* ---------------------------------------------------------- atualizar */

  function atualizar(dados) {
    if (!montado()) return;
    const lista = prepararSalas(dados);
    const presentes = new Set(lista.map((s) => s.chave));
    let y = CENA.margem;

    lista.forEach((info) => {
      const plano = planejarSala({ ativos: info.ativos, total: info.execucoes.length }, CENA.largura - CENA.margem * 2);
      const pos = { x: CENA.margem + 1, y };
      let sala = salas.get(info.chave);
      if (!sala) {
        sala = criarSala(info, plano, pos);
        salas.set(info.chave, sala);
      } else {
        sala.dados = info;
        if (sala.plano.assinatura !== plano.assinatura) redesenharSala(sala, plano);
        if (sala.y !== pos.y) moverSala(sala, pos);
      }
      y += plano.altura + CENA.margem;
    });

    salas.forEach((sala, chave) => {
      if (presentes.has(chave)) return;
      entidades.forEach((ent, id) => {
        if (ent.sala === chave) entidades.delete(id);
      });
      sala.el.classList.add('sumindo');
      setTimeout(() => sala.el.remove(), 900);
      salas.delete(chave);
    });

    svg.setAttribute('viewBox', `0 0 ${CENA.largura} ${Math.max(200, y)}`);

    // pessoas: diferença por id. Quem está na tela e continua no payload só
    // muda de estado; quem é novo surge num lugar; quem saiu do payload (o
    // prazo de convivência venceu) some devagar onde estiver.
    const vistos = new Set();
    lista.forEach((info) => {
      info.execucoes.forEach((e) => {
        vistos.add(e.id);
        const ent = entidades.get(e.id);
        if (!ent) criarPessoa(e, info.chave);
        else if (!ent.sumindo) mudarEstado(ent, e);
      });
    });
    entidades.forEach((ent, id) => {
      if (!vistos.has(id) && !ent.sumindo) sumir(ent);
    });

    salas.forEach((sala) => {
      atualizarCabecalho(sala);
      atualizarMonitores(sala);
    });
    atualizarLinks();
  }

  /* --------------------------------------------------------------- salas */

  function criarSala(info, plano, pos) {
    const el = svgEl('g', { transform: `translate(${pos.x},${pos.y})` }, 'sala-escritorio pp-sala nascendo');
    const estatico = svgEl('g', {}, 'estatico');
    const gente = svgEl('g', {}, 'gente');
    el.appendChild(estatico);
    el.appendChild(gente);
    camadaSalas.appendChild(el);
    const sala = { chave: info.chave, el, estatico, gente, plano, grade: null, x: pos.x, y: pos.y, dados: info, telas: new Map() };
    redesenharSala(sala, plano);
    setTimeout(() => el.classList.remove('nascendo'), 40);
    return sala;
  }

  // Mascotes felinos da software house: Cold, Harry e Powder
  const PONTOS_GATOS = [
    { id: 'comida', x: 226, y: 50, acao: 'comendo', balao: '🥣 *nham nham*', duracao: [6000, 11000] },
    { id: 'agua', x: 221, y: 50, acao: 'bebendo', balao: '💧 *lap lap*', duracao: [5000, 9000] },
    { id: 'caixinha', x: 360, y: 80, acao: 'caixinha', balao: '📦 🐾', duracao: [6000, 11000] },
    { id: 'lounge_tapete', x: 310, y: 135, acao: 'dormindo', balao: '💤 Zzz...', duracao: [16000, 32000] },
    { id: 'lounge_janela', x: 298, y: 44, acao: 'sentado', balao: '🌙 *olhando a noite*', duracao: [8000, 16000] },
    { id: 'techlead_canto', x: 50, y: 54, acao: 'dormindo', balao: '💤 Zzz...', duracao: [14000, 26000] },
    { id: 'dev_chao', x: 139, y: 120, acao: 'dormindo', balao: '💤 Zzz...', duracao: [16000, 30000] },
    { id: 'dev_rack', x: 182, y: 50, acao: 'sentado', balao: '🐱 *observando os leds*', duracao: [7000, 14000] },
    { id: 'cafe_balcao', x: 242, y: 80, acao: 'sentado', balao: '☕ *cheirando o café*', duracao: [6000, 12000] },
    { id: 'corredor', x: 155, y: 80, acao: 'miando', balao: '🐱 Miau!', duracao: [4000, 8000] }
  ];

  const MIADOS_ALEATORIOS = ['🐱 Miau!', '🐾 Prrr...', '✨ Nyan!', '🐟 Miauu!', '🐈 Purr...'];

  const GATOS_ESTADO = [
    { id: 'cold', nome: 'Cold', desc: 'Mascote Oficial (Gato Preto)', x: 312, y: 135, cor: '#141219', olhos: '#F5C66B', coleira: '#E42E2E', tipo: 'preto', pose: 'deitado', estado: 'dormindo', dir: 1, alvo: null, proximaAcao: performance.now() + 6000, balao: null, balaoAte: 0, el: null },
    { id: 'harry', nome: 'Harry', desc: 'Guardião Noturno (Gato Preto)', x: 234, y: 80, cor: '#1B1824', olhos: '#2ECC71', coleira: '#27AE60', tipo: 'preto', pose: 'sentado', estado: 'sentado', dir: 1, alvo: null, proximaAcao: performance.now() + 10000, balao: null, balaoAte: 0, el: null },
    { id: 'powder', nome: 'Powder', desc: 'Inspetora de Código (Gatinha Rajada)', x: 139, y: 120, cor: '#96887B', listras: '#4A3E33', olhos: '#4A90E2', coleira: '#E0409A', tipo: 'rajada', pose: 'deitado', estado: 'dormindo', dir: 1, alvo: null, proximaAcao: performance.now() + 14000, balao: null, balaoAte: 0, el: null }
  ];

  function renderizarHtmlGato(gato) {
    return `
      <title>${gato.nome} · ${gato.desc}</title>
      <ellipse cx="0" cy="5" rx="11" ry="3.5" fill="rgba(0,0,0,0.35)"/>
      <g class="gato-pulo">
        <g class="gato-visual" transform="scale(${gato.dir}, 1)">
          ${gato.pose === 'sentado' ? `
            <path d="M-6,7 C-7,2 -5,-4 -2,-6 C-1,-7 1,-7 2,-6 C5,-4 7,2 6,7 Z" fill="${gato.cor}"/>
            <circle cx="0" cy="-7" r="5" fill="${gato.cor}"/>
            <polygon points="-4,-11 -2,-7 -5,-7" fill="${gato.cor}"/>
            <polygon points="4,-11 2,-7 5,-7" fill="${gato.cor}"/>
            <circle cx="-1.8" cy="-7.5" r="1.1" fill="${gato.olhos}"/>
            <circle cx="1.8" cy="-7.5" r="1.1" fill="${gato.olhos}"/>
            <rect x="-3" y="-3.5" width="6" height="1.8" rx="0.8" fill="${gato.coleira}"/>
            <path class="rabo" d="M5,6 Q9,4 8,0 Q7,-2 6,-1" stroke="${gato.cor}" stroke-width="2" fill="none" stroke-linecap="round"/>
          ` : `
            <ellipse cx="0" cy="0" rx="9" ry="6" fill="${gato.cor}"/>
            ${gato.tipo === 'rajada' ? `
              <path d="M-5,-4 Q-4,-1 -5,2" stroke="${gato.listras}" stroke-width="1.2" fill="none"/>
              <path d="M-1,-5 Q0,-1 -1,3" stroke="${gato.listras}" stroke-width="1.2" fill="none"/>
              <path d="M3,-5 Q4,-1 3,3" stroke="${gato.listras}" stroke-width="1.2" fill="none"/>
              <ellipse cx="7" cy="3" rx="2" ry="1.2" fill="#ECE9F2"/>
            ` : ''}
            <circle cx="-5" cy="-2" r="4.5" fill="${gato.cor}"/>
            <polygon points="-8,-7 -5,-4 -8,-3" fill="${gato.cor}"/>
            <polygon points="-4,-7 -2,-3 -5,-4" fill="${gato.cor}"/>
            <circle cx="-6" cy="-2.5" r="1" fill="${gato.olhos}"/>
            <path class="rabo" d="M6,2 Q9,0 8,-3 Q6,-4 5,-2" stroke="${gato.cor}" stroke-width="2" fill="none" stroke-linecap="round"/>
          `}
        </g>
      </g>
      <g class="gato-balao" style="display:${gato.balao ? 'inline' : 'none'};">
        <rect x="-34" y="-34" width="68" height="17" rx="5" fill="#1b1726" stroke="#E42E2E" stroke-width="1.2"/>
        <polygon points="-3,-17 0,-13 3,-17" fill="#1b1726"/>
        <text class="gato-balao-txt" x="0" y="-22" font-size="8.5" text-anchor="middle" fill="#fff">${gato.balao || ''}</text>
      </g>
      <rect class="gato-placa" x="-19" y="8" width="38" height="12" rx="3"/>
      <text class="gato-nome" x="0" y="17">🐱 ${gato.nome}</text>
    `;
  }

  function atualizarBalaoGato(gato) {
    if (!gato.el) return;
    const gBalao = gato.el.querySelector('.gato-balao');
    const txtBalao = gato.el.querySelector('.gato-balao-txt');
    if (gBalao && txtBalao) {
      if (gato.balao) {
        gBalao.style.display = 'inline';
        txtBalao.textContent = gato.balao;
      } else {
        gBalao.style.display = 'none';
      }
    }
  }

  function atualizarGatos(agora, dt) {
    GATOS_ESTADO.forEach((gato) => {
      if (!gato.el) return;

      if (gato.balao && agora > gato.balaoAte) {
        gato.balao = null;
        atualizarBalaoGato(gato);
      }

      if (gato.alvo) {
        const dx = gato.alvo.x - gato.x;
        const dy = gato.alvo.y - gato.y;
        const dist = Math.hypot(dx, dy);
        const passo = 26 * dt;

        if (dist > 0.6) {
          gato.dir = dx >= 0 ? 1 : -1;
          gato.x += (dx / dist) * Math.min(dist, passo);
          gato.y += (dy / dist) * Math.min(dist, passo);
          gato.el.setAttribute('transform', `translate(${gato.x * P},${gato.y * P})`);
          const visual = gato.el.querySelector('.gato-visual');
          if (visual) visual.setAttribute('transform', `scale(${gato.dir}, 1)`);
        } else {
          gato.x = gato.alvo.x;
          gato.y = gato.alvo.y;
          gato.estado = gato.alvo.acao;
          gato.pose = ['comendo', 'bebendo', 'caixinha', 'sentado', 'miando'].includes(gato.estado) ? 'sentado' : 'deitado';
          if (gato.alvo.balao) {
            gato.balao = gato.alvo.balao;
            gato.balaoAte = agora + 4200;
          }
          gato.proximaAcao = agora + entre(gato.alvo.duracao || [6000, 14000]);
          gato.alvo = null;
          gato.el.innerHTML = renderizarHtmlGato(gato);
        }
        return;
      }

      if (agora > gato.proximaAcao) {
        const sorteados = PONTOS_GATOS.filter((p) => Math.hypot(p.x - gato.x, p.y - gato.y) > 20);
        const escolhido = sorteados[Math.floor(Math.random() * sorteados.length)] || PONTOS_GATOS[0];
        gato.alvo = { ...escolhido };
        gato.estado = 'andando';
        gato.pose = 'sentado';
        if (Math.random() < 0.28) {
          gato.balao = MIADOS_ALEATORIOS[Math.floor(Math.random() * MIADOS_ALEATORIOS.length)];
          gato.balaoAte = agora + 3200;
        }
        gato.el.innerHTML = renderizarHtmlGato(gato);
      }
    });
  }

  function montarCamadaGatos(camadaGatos) {
    camadaGatos.innerHTML = '';
    GATOS_ESTADO.forEach((gato) => {
      const gGato = svgEl('g', { class: `gato gato-${gato.id}`, transform: `translate(${gato.x * P},${gato.y * P})` });
      gato.el = gGato;
      gGato.innerHTML = renderizarHtmlGato(gato);
      gGato.addEventListener('click', (ev) => {
        ev.stopPropagation();
        gato.balao = '❤️ *ronrom* Miau!';
        gato.balaoAte = performance.now() + 4500;
        gGato.classList.add('pulinho');
        setTimeout(() => gGato.classList.remove('pulinho'), 400);
        atualizarBalaoGato(gato);
      });
      camadaGatos.appendChild(gGato);
    });
  }

  function redesenharSala(sala, plano) {
    sala.plano = plano;
    sala.grade = criarGrade(plano);
    const g = sala.estatico;
    g.innerHTML = '';
    const arte = svgEl('g', { transform: `scale(${P})` }, 'pp-arte');
    pintarSala(plano).forEach((c) => arte.appendChild(svgEl('path', { d: c.d, fill: c.cor })));
    g.appendChild(arte);

    g.appendChild(svgEl('rect', { x: 12, y: 15, width: 6, height: 6 }, 'led'));
    const titulo = svgEl('text', { x: 27, y: 22 }, 'sala-nome');
    titulo.setAttribute('data-papel', 'titulo');
    g.appendChild(titulo);
    const sub = svgEl('text', { x: 27, y: 37 }, 'sala-sub');
    sub.setAttribute('data-papel', 'sub');
    g.appendChild(sub);
    const resumo = svgEl('text', { x: plano.largura - 12, y: 22, 'text-anchor': 'end' }, 'sala-sub direita');
    resumo.setAttribute('data-papel', 'resumo');
    g.appendChild(resumo);
    [
      ['Tech Lead & JARVIS', X.techlead[0] + 2],
      ['Dev Studio', X.trabalho[0] + 18],
      ['Cafeteria', X.cafe[0] + 14],
      ['Lounge', X.estar[0] + 12],
      ['WC 🚻', X.banheiro[0] + 6]
    ].forEach(([texto, x]) => {
      g.appendChild(svgEl('text', { x: x * P, y: plano.altura - 15 }, 'pp-area')).textContent = texto;
    });

    // telas dos monitores: vetor alinhado à grade, acende com quem digita
    sala.telas = new Map();
    plano.moveis.filter((m) => m.tipo === 'mesa' || m.tipo === 'mesa-techlead' || m.tipo === 'mesa-jarvis').forEach((m) => {
      const isTech = m.tipo === 'mesa-techlead' || m.tipo === 'mesa-jarvis';
      const tela = svgEl('g', { transform: `translate(${m.x * P},${m.y * P})` }, 'pp-tela');
      tela.appendChild(svgEl('rect', { x: isTech ? -42 : -36, y: 0, width: isTech ? 84 : 75, height: 21 }, 'pp-luz'));
      tela.appendChild(svgEl('rect', { x: isTech ? -22 : -15, y: -15, width: isTech ? 44 : 33, height: 15 }, 'pp-vidro'));
      tela.appendChild(svgEl('rect', { x: isTech ? -18 : -12, y: -12, width: isTech ? 20 : 15, height: 3 }, 'pp-linha l1'));
      tela.appendChild(svgEl('rect', { x: isTech ? -18 : -12, y: -6, width: isTech ? 28 : 21, height: 3 }, 'pp-linha l2'));
      g.appendChild(tela);
      sala.telas.set(m.id, tela);
    });

    // Mascotes felinos da software house: Cold, Harry e Powder
    const camadaGatos = svgEl('g', {}, 'camada-gatos');
    montarCamadaGatos(camadaGatos);
    g.appendChild(camadaGatos);
    g.appendChild(svgEl('rect', { x: 0.5, y: 0.5, width: plano.largura - 1, height: plano.altura - 1 }, 'parede pp-contorno'));

    // quem tinha vaga que não existe mais na planta nova procura outra
    entidades.forEach((ent) => {
      if (ent.sala === sala.chave && ent.vaga && !plano.vagas.some((v) => v.id === ent.vaga.id)) {
        ent.vaga = null;
        ent.proxima = 0;
      }
    });
    atualizarCabecalho(sala);
  }

  function moverSala(sala, pos) {
    // a sala de baixo desliza quando a de cima cresce; sem tween próprio,
    // em degraus de transição CSS
    sala.x = pos.x;
    sala.y = pos.y;
    sala.el.setAttribute('transform', `translate(${pos.x},${pos.y})`);
  }

  function atualizarCabecalho(sala) {
    const info = sala.dados;
    const titulo = sala.estatico.querySelector('[data-papel="titulo"]');
    if (!titulo) return;
    titulo.textContent = info.nome;
    const n = { trabalhando: 0, delegando: 0, aguardando: 0, concluida: 0, orfa: 0 };
    entidades.forEach((ent) => {
      if (ent.sala === sala.chave && !ent.sumindo && n[ent.status] !== undefined) n[ent.status] += 1;
    });
    const partes = [
      n.trabalhando && `${n.trabalhando} trabalhando`,
      n.delegando && `${n.delegando} delegando`,
      n.aguardando && `${n.aguardando} aguardando`,
      n.orfa && `${n.orfa} órfã(s)`,
      n.concluida && `${n.concluida} encerrada(s) · até 12 h`,
    ].filter(Boolean);
    sala.estatico.querySelector('[data-papel="resumo"]').textContent = partes.join(' · ') || 'sala vazia';
    const ativos = n.trabalhando + n.delegando + n.aguardando;
    sala.el.classList.toggle('ativa', n.trabalhando + n.delegando > 0);
    sala.el.classList.toggle('vazia', ativos === 0);
    sala.estatico.querySelector('[data-papel="sub"]').textContent =
      info.cwd || (ativos ? `${ativos} execução(ões) ativa(s)` : 'nenhuma execução ativa');
  }

  function atualizarMonitores(sala) {
    const digitando = new Set();
    entidades.forEach((ent) => {
      if (ent.sala === sala.chave && ent.vaga && ent.vaga.tipo === 'mesa' && !ent.rota && digita(ent)) digitando.add(ent.vaga.id);
    });
    sala.telas.forEach((tela, id) => tela.classList.toggle('ligada', digitando.has(id)));
  }

  /* ------------------------------------------------------------ pessoas */

  const digita = (ent) => ent.status === 'trabalhando' || ent.status === 'delegando';
  const sorteio = () => Math.random();
  const entre = ([a, b]) => a + Math.random() * (b - a);

  function tempoDe(e) {
    const proj = e.foco_projeto || 'Geral';
    if (e.status === 'trabalhando') return `⚡ [${proj}]`;
    if (e.status === 'delegando') return `🔄 [${proj}]`;
    if (e.status === 'aguardando') return `💤 Aguardando`;
    if (e.status === 'concluida') return `✓ Concluído`;
    if (e.status === 'orfa') return `⚠️ Órfã`;
    return `[${proj}]`;
  }

  function ocupadas(chaveSala, exceto) {
    const set = new Set();
    entidades.forEach((ent) => {
      if (ent.sala === chaveSala && ent.vaga && ent !== exceto && !ent.sumindo) set.add(ent.vaga.id);
    });
    return set;
  }

  function criarPessoa(e, chaveSala) {
    const sala = salas.get(chaveSala);
    if (!sala) return;
    const ap = aparencia(e);
    const familia = familiaDe(e.tipo_agente);
    const el = svgEl('g', {
      'data-id': e.id,
      'data-acao': 'detalhe-execucao',
      tabindex: '0',
      role: 'button',
      style: `--pele:${ap.pele[0]};--pele-s:${ap.pele[1]};--cabelo:${ap.cabelo[0]};--cabelo-s:${ap.cabelo[1]};--camisa:${ap.camisa[0]};--camisa-s:${ap.camisa[1]};--calca:${ap.calca}`,
    }, `personagem avatar pessoa ${e.status} familia-${familia} surgindo`);
    el.appendChild(svgEl('rect', { x: -15, y: -3, width: 30, height: 4 }, 'pp-sombra'));
    const virar = svgEl('g', {}, 'virar');
    const q0 = svgEl('use', { x: -SW * P / 2, y: -SH * P, width: SW * P, height: SH * P }, 'pp-q0');
    const q1 = svgEl('use', { x: -SW * P / 2, y: -SH * P, width: SW * P, height: SH * P }, 'pp-q1');
    virar.appendChild(q0);
    virar.appendChild(q1);
    el.appendChild(virar);

    // marcador do estado sobre a cabeça: losango; vazio quando encerrada
    const marca = svgEl('g', { transform: 'translate(0,-78)' }, 'pp-marca');
    marca.appendChild(svgEl('path', { d: 'M0 -12 L12 0 L0 12 L-12 0 Z' }, 'pp-marca-borda'));
    marca.appendChild(svgEl('path', { d: 'M0 -7.5 L7.5 0 L0 7.5 L-7.5 0 Z' }, 'pp-marca-miolo'));
    el.appendChild(marca);
    const alerta = svgEl('g', { transform: 'translate(-9,-96)' }, 'pp-alerta');
    alerta.appendChild(svgEl('rect', { x: 0, y: 0, width: 18, height: 21 }, 'pp-balao-borda'));
    alerta.appendChild(svgEl('rect', { x: 3, y: 3, width: 12, height: 15 }, 'pp-balao'));
    alerta.appendChild(svgEl('rect', { x: 6, y: 21, width: 6, height: 3 }, 'pp-balao-borda'));
    alerta.appendChild(svgEl('rect', { x: 7.5, y: 5, width: 3, height: 7 }, 'pp-exclamacao'));
    alerta.appendChild(svgEl('rect', { x: 7.5, y: 13.5, width: 3, height: 3 }, 'pp-exclamacao'));
    el.appendChild(alerta);

    // balão de convivência / conversa / café
    const social = svgEl('g', { transform: 'translate(4,-96)' }, 'pp-social');
    social.innerHTML = `<rect x="0" y="0" width="18" height="17" rx="4" fill="#1b1726" stroke="#E42E2E" stroke-width="1.2"/><polygon points="4,17 7,21 10,17" fill="#1b1726"/><text x="9" y="12" font-size="9" text-anchor="middle" fill="#fff" class="balao-icone">💬</text>`;
    el.appendChild(social);

    const placa = svgEl('g', { transform: 'translate(0,4)' }, 'pp-placa');
    placa.appendChild(svgEl('rect', { x: -40, y: 0, width: 80, height: 14 }, 'pp-placa-fundo'));
    const cracha = svgEl('g', { transform: 'translate(-31,7) scale(.78)' }, 'cracha');
    cracha.innerHTML = `<rect class="cracha-fundo" x="-6.5" y="-5.5" width="13" height="11" rx="2"/>${glifoDe(e.tipo_agente)}`;
    placa.appendChild(cracha);
    const nome = svgEl('text', { x: -24, y: 10.5 }, 'nome');
    nome.textContent = rotulo(e.tipo_agente);
    placa.appendChild(nome);
    el.appendChild(placa);
    el.appendChild(svgEl('text', { x: 0, y: 28, 'text-anchor': 'middle' }, 'tempo')).textContent = tempoDe(e);

    const ent = {
      id: e.id, sala: chaveSala, el, virar, q0, q1, ap,
      status: e.status, tipo: e.tipo_agente, pai: e.execucao_pai_id || null,
      x: 0, y: 0, vaga: null, rota: null, pose: null, dir: 'baixo', proxima: 0, sumindo: false,
    };
    el.setAttribute('aria-label', `${rotulo(e.tipo_agente)}: ${e.status}`);
    sala.gente.appendChild(el);
    ajustarPlaca(ent);

    // surge direto num lugar coerente com o estado, sem entrar por porta
    const vaga = escolherVaga(sala.plano, e.status, ocupadas(chaveSala, ent), sorteio(), null, e.tipo_agente);
    if (vaga) {
      ent.vaga = vaga;
      ent.x = vaga.x;
      ent.y = vaga.y;
    } else {
      ent.x = 150;
      ent.y = sala.plano.H - 12;
    }
    ent.proxima = ['trabalhando', 'delegando'].includes(e.status)
      ? performance.now() + 600000
      : performance.now() + (e.status === 'orfa' ? Infinity : entre(permanencia(ent)));
    entidades.set(e.id, ent);
    posicionar(ent);
    atualizarPose(ent);
    ordenar(sala);
    setTimeout(() => el.classList.remove('surgindo'), 40);
  }

  /* Nome que não cabe é cortado com "…"; o tooltip e o detalhe têm o nome
     inteiro. Assim duas placas vizinhas nunca se sobrepõem. */
  function ajustarPlaca(ent) {
    const texto = ent.el.querySelector('.pp-placa .nome');
    if (!texto || !texto.getComputedTextLength) return;
    const inteiro = texto.textContent;
    let corte = inteiro.length;
    while (corte > 4 && texto.getComputedTextLength() + 24 > PLACA_MAX) {
      corte -= 1;
      texto.textContent = `${inteiro.slice(0, corte)}…`;
    }
    const largura = Math.ceil((texto.getComputedTextLength() + 24) / P) * P;
    const x0 = -Math.round(largura / 2 / P) * P;
    ent.el.querySelector('.pp-placa-fundo').setAttribute('x', x0);
    ent.el.querySelector('.pp-placa-fundo').setAttribute('width', largura);
    ent.el.querySelector('.pp-placa .cracha').setAttribute('transform', `translate(${x0 + 9},7) scale(.78)`);
    texto.setAttribute('x', x0 + 17);
  }

  function mudarEstado(ent, e) {
    const antes = ent.status;
    ent.status = e.status;
    ent.pai = e.execucao_pai_id || null;
    const classes = ['personagem', 'avatar', 'pessoa', e.status, `familia-${familiaDe(e.tipo_agente)}`];
    if (ent.rota) classes.push('andando');
    ent.el.setAttribute('class', classes.join(' '));
    ent.el.setAttribute('aria-label', `${rotulo(e.tipo_agente)}: ${e.status}`);
    ent.el.querySelector('.tempo').textContent = tempoDe(e);
    if (antes === e.status) return;

    // Se está trabalhando ou delegando: VAI E FICA NA SUA MESA FIXA DESIGNADA!
    if (['trabalhando', 'delegando'].includes(e.status)) {
      const sala = salas.get(ent.sala);
      const mesaDesignadaId = MESAS_DESIGNADAS[ent.tipo] || MESAS_DESIGNADAS[e.tipo_agente];
      if (mesaDesignadaId && sala) {
        if (ent.vaga?.id !== mesaDesignadaId) {
          const mesaVaga = sala.plano.vagas.find((v) => v.id === mesaDesignadaId);
          if (mesaVaga) {
            ent.vaga = mesaVaga;
            irPara(ent, sala, mesaVaga);
            return;
          }
        }
      }
      ent.proxima = performance.now() + 9999999;
      atualizarPose(ent);
      if (sala) atualizarMonitores(sala);
      return;
    }

    // mudou de estado: decide logo para onde vai.
    const naConvivencia = ent.vaga && CONVIVENCIA.includes(ent.vaga.zona);
    if (e.status === 'orfa') {
      ent.proxima = naConvivencia ? Infinity : performance.now();
    } else if (e.status === 'concluida') {
      ent.proxima = naConvivencia ? performance.now() + entre(permanencia(ent)) : performance.now();
    } else {
      ent.proxima = Math.min(ent.proxima, performance.now() + entre([600, 2500]));
    }
    atualizarPose(ent);
  }

  function permanencia(ent) {
    if (['trabalhando', 'delegando'].includes(ent.status)) {
      return [999999, 999999]; // Nunca sai da mesa por tempo enquanto trabalha
    }
    const zona = ent.vaga ? ent.vaga.zona : 'estar';
    const base = PERMANENCIA[zona] || [8000, 20000];
    return ent.status === 'concluida' ? [base[0] * 1.6, base[1] * 1.6] : base;
  }

  function sumir(ent) {
    ent.sumindo = true;
    ent.rota = null;
    ent.el.classList.add('sumindo');
    const link = links.get(ent.id);
    if (link) {
      link.remove();
      links.delete(ent.id);
    }
    setTimeout(() => {
      ent.el.remove();
      entidades.delete(ent.id);
      const sala = salas.get(ent.sala);
      if (sala) {
        atualizarCabecalho(sala);
        atualizarMonitores(sala);
      }
    }, 1400);
  }

  function posicionar(ent) {
    ent.el.setAttribute('transform', `translate(${Math.round(ent.x) * P},${Math.round(ent.y) * P})`);
  }

  /* Pose e quadro saem de onde a pessoa está e do estado. */
  function atualizarPose(ent) {
    let pose;
    let anim = '';
    if (ent.rota) {
      pose = ent.dir === 'cima' ? 'andar-costas' : ent.dir === 'baixo' ? 'andar-frente' : 'andar-lado';
      anim = 'anim-andar';
    } else if (ent.vaga && ent.vaga.tipo === 'mesa') {
      pose = digita(ent) ? 'digitar' : 'sentado-costas';
      anim = digita(ent) ? (ent.status === 'delegando' ? 'anim-digitar-lento' : 'anim-digitar') : '';
    } else if (ent.vaga && ent.vaga.tipo === 'banqueta') {
      pose = 'sentado-costas';
    } else if (ent.vaga && ent.vaga.tipo === 'balcao') {
      pose = 'pe-costas';
    } else if (ent.vaga && ent.vaga.tipo === 'sofa') {
      pose = 'sentado-frente';
      anim = 'anim-piscar';
    } else {
      pose = 'pe-frente';
      anim = 'anim-piscar';
    }
    if (ent.status === 'orfa' || ent.status === 'concluida') anim = anim === 'anim-andar' ? anim : '';
    const chave = `${pose}|${anim}|${ent.dir === 'esq' ? 1 : 0}`;
    if (ent.pose === chave) return;
    ent.pose = chave;
    ent.q0.setAttribute('href', simbolo(ent.ap.estilo, ent.ap.principal, pose, 0, ent.ap.regata));
    ent.q1.setAttribute('href', simbolo(ent.ap.estilo, ent.ap.principal, pose, 1, ent.ap.regata));
    ent.virar.setAttribute('transform', ent.rota && ent.dir === 'esq' ? 'scale(-1,1)' : '');
    ['anim-andar', 'anim-digitar', 'anim-digitar-lento', 'anim-piscar'].forEach((c) => ent.el.classList.toggle(c, c === anim));
    ent.el.classList.toggle('andando', Boolean(ent.rota));

    const naConvivencia = ent.vaga && CONVIVENCIA.includes(ent.vaga.zona);
    const emAtividade = ['trabalhando', 'delegando'].includes(ent.status);
    if (!emAtividade && naConvivencia && !ent.rota) {
      ent.el.classList.add('na-conversa');
      const icone = ent.vaga?.zona === 'cafe' ? '☕' : (ent.vaga?.tipo === 'sofa' ? '💬' : '💭');
      const txt = ent.el.querySelector('.balao-icone');
      if (txt) txt.textContent = icone;
    } else {
      ent.el.classList.remove('na-conversa');
    }
  }

  /* Quem está mais embaixo fica na frente. Só reordena o necessário. */
  function ordenar(sala) {
    const lista = [];
    entidades.forEach((ent) => {
      if (ent.sala === sala.chave && ent.el.parentNode === sala.gente) lista.push(ent);
    });
    lista.sort((a, b) => a.y - b.y || a.id - b.id);
    let anterior = null;
    lista.forEach((ent) => {
      const esperado = anterior ? anterior.el.nextSibling : sala.gente.firstChild;
      if (esperado !== ent.el) sala.gente.insertBefore(ent.el, esperado);
      anterior = ent;
    });
  }

  /* ------------------------------------------------------------- agenda */

  /* A cada 0,7 s: quem já ficou o bastante no lugar escolhe outro e anda
     até lá. Com movimento reduzido, ninguém circula: só muda de lugar quando
     o estado obriga (encerrou, ficou órfão), e muda sem andar. */
  function agenda() {
    if (!montado() || document.hidden) return;
    const agora = performance.now();
    entidades.forEach((ent) => {
      if (ent.sumindo || ent.rota || agora < ent.proxima) return;
      const sala = salas.get(ent.sala);
      if (!sala) return;
      // Quem está trabalhando ou delegando e já está na mesa: FICA NA MESA TRABALHANDO!
      if (['trabalhando', 'delegando'].includes(ent.status) && ent.vaga && ent.vaga.zona === 'mesa') {
        ent.proxima = agora + 60000;
        return;
      }
      const naConvivencia = ent.vaga && CONVIVENCIA.includes(ent.vaga.zona);
      if (reduzido() && (naConvivencia || !['concluida', 'orfa'].includes(ent.status))) {
        ent.proxima = agora + 60000;
        return;
      }
      const vaga = escolherVaga(sala.plano, ent.status, ocupadas(ent.sala, ent), sorteio(), ent.vaga && ent.vaga.id, ent.tipo);
      if (!vaga) {
        ent.proxima = agora + 5000;
        return;
      }
      irPara(ent, sala, vaga);
    });
  }

  function irPara(ent, sala, vaga) {
    ent.vaga = vaga;
    const de = { x: ent.x, y: ent.y };
    const caminho = rota(sala.grade, de, vaga.acesso) || [vaga.acesso];
    // sai do lugar direto para a célula livre mais perto, anda, e no fim
    // dá o passo curto do corredor até o assento
    const pontos = [...caminho, { x: vaga.x, y: vaga.y }];
    if (reduzido()) {
      ent.x = vaga.x;
      ent.y = vaga.y;
      chegou(ent, sala);
      return;
    }
    ent.rota = pontos;
    atualizarMonitores(sala);
    if (!raf) {
      ultimoQuadro = performance.now();
      raf = requestAnimationFrame(tick);
    }
  }

  function chegou(ent, sala) {
    ent.rota = null;
    ent.x = ent.vaga ? ent.vaga.x : ent.x;
    ent.y = ent.vaga ? ent.vaga.y : ent.y;
    ent.dir = 'baixo';
    posicionar(ent);
    ent.proxima = ent.status === 'orfa' ? Infinity : performance.now() + entre(permanencia(ent));
    atualizarPose(ent);
    ordenar(sala);
    atualizarMonitores(sala);
  }

  function tick(agora) {
    const dt = Math.min(0.1, (agora - ultimoQuadro) / 1000);
    ultimoQuadro = agora;
    let alguem = false;
    entidades.forEach((ent) => {
      if (!ent.rota || ent.sumindo) return;
      alguem = true;
      let passo = VELOCIDADE * dt;
      while (passo > 0 && ent.rota && ent.rota.length) {
        const alvo = ent.rota[0];
        const dx = alvo.x - ent.x;
        const dy = alvo.y - ent.y;
        const d = Math.hypot(dx, dy);
        if (d > 0.01) {
          const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'dir' : 'esq') : dy > 0 ? 'baixo' : 'cima';
          if (dir !== ent.dir) {
            ent.dir = dir;
            atualizarPose(ent);
          }
        }
        if (d <= passo) {
          ent.x = alvo.x;
          ent.y = alvo.y;
          passo -= d;
          ent.rota.shift();
        } else {
          ent.x += (dx / d) * passo;
          ent.y += (dy / d) * passo;
          passo = 0;
        }
      }
      posicionar(ent);
      if (ent.rota && !ent.rota.length) {
        const sala = salas.get(ent.sala);
        if (sala) chegou(ent, sala);
        else ent.rota = null;
      }
    });
    atualizarLinks();
    atualizarGatos(agora, dt);
    raf = requestAnimationFrame(tick);
  }

  /* --------------------------------------------------------------- links */

  function atualizarLinks() {
    if (!camadaLinks) return;
    camadaLinks.innerHTML = '';
    links.clear();
  }

  /* ---------------------------------------------------------------- rota */

  function aoPassarMouse(evento) {
    const alvo = evento.target.closest && evento.target.closest('.pessoa');
    if (!alvo || !trajetoLigado()) return;
    const ent = entidades.get(Number(alvo.getAttribute('data-id')));
    if (ent) mostrarRota(ent.tipo);
  }

  function aoSairMouse(evento) {
    const de = evento.target.closest && evento.target.closest('.pessoa');
    const para = evento.relatedTarget && evento.relatedTarget.closest && evento.relatedTarget.closest('.pessoa');
    if (de && de !== para) limparRota();
  }

  function mostrarRota(tipo) {
    limparRota();
    const chaveDe = (execucao) => execucao.projeto_id
      ? `p${execucao.projeto_id}`
      : `c${String(execucao.cwd || '').replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase()}`;
    const historico = ((obterHistorico() || {})[tipo] || []).slice().reverse();
    const chaves = [];
    historico.forEach((h) => {
      const chave = chaveDe(h);
      if (salas.has(chave) && chaves[chaves.length - 1] !== chave) chaves.push(chave);
    });
    chaves.forEach((chave) => salas.get(chave).el.classList.add('na-rota'));
    if (chaves.length < 2) return;
    const pontos = chaves.map((chave) => {
      const s = salas.get(chave);
      return `${s.x + s.plano.largura / 2},${s.y + 30}`;
    });
    camadaRota.appendChild(svgEl('polyline', { points: pontos.join(' '), fill: 'none' }, 'rota'));
    chaves.forEach((chave, i) => {
      const s = salas.get(chave);
      const marca = svgEl('g', { transform: `translate(${s.x + s.plano.largura / 2},${s.y + 30})` }, 'rota-marca');
      marca.appendChild(svgEl('circle', { r: 10 }));
      marca.appendChild(svgEl('text', { y: 3.5, 'text-anchor': 'middle' })).textContent = String(i + 1);
      camadaRota.appendChild(marca);
    });
  }

  function limparRota() {
    if (!camadaRota) return;
    camadaRota.innerHTML = '';
    salas.forEach((s) => s.el.classList.remove('na-rota'));
  }

  /* ------------------------------------------------------------ exportar */

  raiz.EscritorioPixel = { montar, atualizar, destruir, montado, logica, _estado: { salas, entidades } };
  if (typeof module !== 'undefined' && module.exports) module.exports = logica;
})(typeof window !== 'undefined' ? window : globalThis);
