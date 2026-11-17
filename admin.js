
const $ = s => document.querySelector(s);

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
}[c]));

const moeda = n => Number(n || 0).toLocaleString('pt-BR', {
  style: 'currency',
  currency: 'BRL'
});

const hoje = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
}).format(new Date());

const dataSP = iso => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
}).format(new Date(iso));

const localSP = iso => new Date(iso).toLocaleString('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  dateStyle: 'short',
  timeStyle: 'short'
});

const horaSP = (data, hora) =>
  new Date(`${data}T${hora}:00-03:00`);

let eventos = [];
let bloqueios = [];
let clientes = [];

function msg(s) {
  $('#aviso').textContent = s;
}

$('#form').elements.data.value = hoje();

SERVICOS.forEach((s, i) => {
  $('#servico').add(new Option(s.nome, i));
});

$('#servico').onchange = () => {
  const v = $('#servico').value;
  if (v === '') return;

  const s = SERVICOS[Number(v)];
  $('#duracao').value = s.duracao;
  $('#valor').value = s.valor ?? 0;
};

$('#categoria').onchange = () => {
  if ($('#categoria').value === 'Pessoal') {
    $('#servico').value = '';
    $('#duracao').value = 60;
    $('#valor').value = 0;
    $('#form').elements.pagamento.value = 'Não se aplica';
  }
};

async function refresh() {
  const [a, b, c] = await Promise.all([
    db.from('agendamentos')
      .select('*')
      .order('inicio', { ascending: true })
      .limit(1000),

    db.from('bloqueios')
      .select('*')
      .order('inicio', { ascending: true })
      .limit(1000),

    db.from('clientes')
      .select('id,nome')
      .limit(1000)
  ]);

  const erro = a.error || b.error || c.error;

  if (erro) {
    msg('Erro ao carregar: ' + erro.message);
    return;
  }

  eventos = a.data || [];
  bloqueios = b.data || [];
  clientes = c.data || [];

  render();
  msg('Agenda sincronizada com a nuvem.');
}

function render() {
  const tipo = $('#tipo').value;
  const filtro = $('#filtro').value;

  const lista = [
    ...eventos.map(x => ({
      ...x,
      categoria: 'Studio',
      nome: clientes.find(c => c.id === x.cliente_id)?.nome
        || 'Cliente não identificado',
      obs: x.observacoes || '',
      duracao: Math.round(
        (new Date(x.fim) - new Date(x.inicio)) / 60000
      )
    })),

    ...bloqueios.map(x => ({
      ...x,
      categoria: 'Pessoal',
      nome: x.motivo || 'Bloqueio',
      servico: 'Bloqueio pessoal',
      pagamento: 'Não se aplica',
      valor: 0,
      obs: '',
      duracao: Math.round(
        (new Date(x.fim) - new Date(x.inicio)) / 60000
      )
    }))
  ]
  .filter(x =>
    (!tipo || x.categoria === tipo) &&
    (!filtro || dataSP(x.inicio) === filtro)
  )
  .sort((a, b) =>
    new Date(a.inicio) - new Date(b.inicio)
  );

  $('#lista').innerHTML = lista.length
    ? lista.map(x => `
      <article>
        <strong>${esc(x.nome)}</strong>
        <span class="pill">${esc(x.categoria)}</span>
        <div>
          ${esc(localSP(x.inicio))} • ${x.duracao} min
        </div>
        <div>
          ${esc(x.servico || '')} •
          ${moeda(x.valor)} •
          ${esc(x.pagamento || '')}
        </div>
        ${x.obs ? `<p>${esc(x.obs)}</p>` : ''}
        <button
          class="danger"
          data-id="${esc(x.id)}"
          data-table="${x.categoria === 'Pessoal'
            ? 'bloqueios'
            : 'agendamentos'}">
          Excluir
        </button>
      </article>
    `).join('')
    : '<p class="muted">Nenhum compromisso encontrado.</p>';

  const recebidos = eventos.filter(
    x => x.pagamento === 'Recebido'
  );

  const pendentes = eventos.filter(
    x => x.pagamento === 'Pendente'
  );

  $('#financeiro').textContent =
    `Recebido: ${moeda(recebidos.reduce(
      (s, x) => s + Number(x.valor || 0), 0
    ))} • Pendente: ${moeda(pendentes.reduce(
      (s, x) => s + Number(x.valor || 0), 0
    ))} • Atendimentos: ${eventos.length}`;
}

$('#lista').onclick = async e => {
  const b = e.target.closest('button[data-id]');

  if (!b || !confirm('Excluir este compromisso?')) {
    return;
  }

  const { error } = await db
    .from(b.dataset.table)
    .delete()
    .eq('id', b.dataset.id);

  if (error) {
    msg('Erro ao excluir: ' + error.message);
  } else {
    await refresh();
  }
};

$('#form').onsubmit = async e => {
  e.preventDefault();

  const f = new FormData(e.target);
  const dia = f.get('data');
  const hora = f.get('hora');
  const duracao = Number(f.get('duracao'));
  const inicio = horaSP(dia, hora);
  const fim = new Date(inicio.getTime() + duracao * 60000);
  const nome = String(f.get('nome') || '').trim();
  const categoria = f.get('categoria');

  if (
    !nome ||
    !Number.isFinite(inicio.getTime()) ||
    !Number.isInteger(duracao) ||
    duracao < 5 ||
    duracao > 720
  ) {
    return msg('Confira nome, data, hora e duração.');
  }

  if (categoria === 'Studio') {
    const diaSemana = new Date(
      `${dia}T12:00:00-03:00`
    ).getUTCDay();

    const minutos =
      Number(hora.slice(0, 2)) * 60 +
      Number(hora.slice(3, 5));

    if (
      diaSemana === 0 ||
      minutos < 480 ||
      minutos + duracao > 1080
    ) {
      return msg(
        'O estúdio atende de segunda a sábado, das 08h às 18h.'
      );
    }
  }

  if (
    [...eventos, ...bloqueios].some(x =>
      inicio < new Date(x.fim) &&
      fim > new Date(x.inicio)
    )
  ) {
    return msg('Horário ocupado. Escolha outro horário.');
  }

  let erro;

  if (categoria === 'Pessoal') {
    ({ error: erro } = await db
      .from('bloqueios')
      .insert({
        inicio: inicio.toISOString(),
        fim: fim.toISOString(),
        motivo: nome
      }));
  } else {
    let cliente = clientes.find(c =>
      c.nome.trim().toLocaleLowerCase('pt-BR') ===
      nome.toLocaleLowerCase('pt-BR')
    );

    if (!cliente) {
      const r = await db
        .from('clientes')
        .insert({ nome })
        .select('id,nome')
        .single();

      if (r.error) {
        return msg(
          'Erro ao cadastrar cliente: ' + r.error.message
        );
      }

      cliente = r.data;
      clientes.push(cliente);
    }

    const i = f.get('servico');
    const servico = i !== ''
      ? SERVICOS[Number(i)]?.nome
      : null;

    ({ error: erro } = await db
      .from('agendamentos')
      .insert({
        cliente_id: cliente.id,
        servico: servico || 'Atendimento',
        inicio: inicio.toISOString(),
        fim: fim.toISOString(),
        valor: Number(f.get('valor') || 0),
        status: 'confirmado',
        pagamento: f.get('pagamento') === 'Recebido'
          ? 'pago'
          : 'pendente',
        observacoes: String(f.get('obs') || '').trim()
      }));
  }

  if (erro) {
    return msg('Erro ao salvar: ' + erro.message);
  }

  e.target.reset();
  e.target.elements.data.value = hoje();

  await refresh();
  msg('Compromisso salvo na nuvem!');
};

$('#tipo').onchange = render;
$('#filtro').onchange = render;

$('#limpar').onclick = () => {
  $('#filtro').value = '';
  render();
};

$('#atualizar').onclick = refresh;

$('#sair').onclick = async () => {
  await db.auth.signOut();
  location.href = 'admin.html';
};

// LOGIN COM E-MAIL E SENHA
$('#loginForm').onsubmit = async e => {
  e.preventDefault();

  const email = $('#email').value.trim();
  const password = $('#senha').value;
  const status = $('#loginStatus');

  status.textContent = 'Entrando...';

  const { error } = await db.auth.signInWithPassword({
    email,
    password
  });

  if (error) {
    status.textContent =
      'Não foi possível entrar. Confira o e-mail e a senha.';
    return;
  }

  status.textContent = 'Login realizado com sucesso!';
  await init();
};

// VERIFICAÇÃO DE ADMINISTRADOR
async function init() {
  const { data: { session }, error } =
    await db.auth.getSession();

  if (error) {
    $('#loginStatus').textContent = error.message;
  }

  let autorizado = false;

  if (session) {
    const r = await db.rpc('eh_admin');

    autorizado = !r.error && r.data === true;

    if (r.error) {
      $('#loginStatus').textContent =
        'Erro ao verificar autorização: ' +
        r.error.message;
    } else if (!autorizado) {
      $('#loginStatus').textContent =
        'Esta conta não tem autorização de administradora.';
    }
  }

  $('#loginBox').hidden = autorizado;
  $('#app').hidden = !autorizado;

  if (autorizado) {
    $('#conta').textContent =
      'Conectada: ' + session.user.email;

    await refresh();
  }
}

db.auth.onAuthStateChange(() => {
  setTimeout(init, 0);
});

init();
