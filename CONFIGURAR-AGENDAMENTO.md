# Ativação da reserva online

A página foi preparada para usar duas funções RPC do Supabase: `horarios_disponiveis_publico` e `reservar_agendamento_publico`. **Não publique como agenda ativa antes de criar e testar essas funções no Supabase**. A versão atual do site apenas enviava pedidos via WhatsApp.

Para ativar com segurança, precisamos confirmar o esquema SQL existente (tipos/colunas de clientes, agendamentos e bloqueios), criar as funções SECURITY DEFINER com permissões mínimas, impedir reservas simultâneas no banco, validar serviços e preços no servidor e testar o acesso anônimo. Não abra políticas de leitura pública de clientes/agendamentos.

O painel administrativo `admin.html` e os arquivos `admin.js`, `style.css`, `supabase.js`, `config.js` foram preservados. A galeria usa fotos provisórias recortadas de prints, mediante autorização para publicação das clientes retratadas.
