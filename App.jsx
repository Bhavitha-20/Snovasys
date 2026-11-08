import { useState, useEffect, useCallback } from 'react'

const money = (c) => (c / 100).toLocaleString(undefined, { style: 'currency', currency: 'USD' })

export default function App() {
  const [auth, setAuth] = useState(null)      // "Basic xxx" kept in memory only
  const [me, setMe] = useState(null)
  const [msg, setMsg] = useState(null)

  const call = useCallback(async (path, opts = {}, header = auth) => {
    const res = await fetch(path, {
      ...opts,
      headers: { 'Content-Type': 'application/json', Authorization: header,
                 ...(opts.method === 'POST' ? { 'Idempotency-Key': crypto.randomUUID() } : {}) },
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`)
    return body
  }, [auth])

  async function login(u, p) {
    const header = 'Basic ' + btoa(`${u}:${p}`)
    try { setMe(await call('/api/me', {}, header)); setAuth(header); setMsg(null) }
    catch { setMsg({ err: 'Login failed' }) }
  }

  if (!me) return <Login onLogin={login} msg={msg} />
  return (
    <main>
      <div className="row"><h1>LedgerLine</h1>
        <span>{me.username} · {me.role} <button className="ghost" onClick={() => { setMe(null); setAuth(null) }}>Log out</button></span></div>
      {msg && <p className={msg.err ? 'err' : 'ok'}>{msg.err || msg.ok}</p>}
      <Accounts call={call} me={me} setMsg={setMsg} />
      {['ADMIN', 'AUDITOR'].includes(me.role) && <Audit call={call} />}
    </main>
  )
}

function Login({ onLogin, msg }) {
  const [u, setU] = useState('alice'); const [p, setP] = useState('')
  return (
    <main><h1>LedgerLine</h1>
      <div className="card">
        <input value={u} onChange={(e) => setU(e.target.value)} placeholder="username" />
        <input type="password" value={p} onChange={(e) => setP(e.target.value)} placeholder="password" />
        <button onClick={() => onLogin(u, p)}>Sign in</button>
        {msg?.err && <p className="err">{msg.err}</p>}
        <p style={{ opacity: .6, fontSize: '.85rem' }}>Demo users: admin, alice, bob, auditor</p>
      </div></main>
  )
}

function Accounts({ call, me, setMsg }) {
  const [accounts, setAccounts] = useState([])
  const [stmt, setStmt] = useState(null)
  const [f, setF] = useState({ accountId: '', amount: '', to: '', owner: '', name: '' })
  const canMove = ['ADMIN', 'HOLDER'].includes(me.role)
  const load = useCallback(() => call('/api/accounts').then(setAccounts).catch((e) => setMsg({ err: e.message })), [call, setMsg])
  useEffect(() => { load() }, [load])

  const run = async (fn, ok) => {
    try { await fn(); setMsg({ ok }); load(); if (stmt) openStatement(stmt.id) }
    catch (e) { setMsg({ err: e.message }) }
  }
  const cents = () => Math.round(parseFloat(f.amount) * 100)
  const post = (path, body) => call(path, { method: 'POST', body: JSON.stringify(body) })
  const openStatement = (id) => call(`/api/accounts/${id}/statement`).then((rows) => setStmt({ id, rows })).catch((e) => setMsg({ err: e.message }))

  return (<>
    <div className="card"><h2>Accounts</h2>
      <table><thead><tr><th>ID</th><th>Name</th><th>Owner</th><th>Balance</th><th></th></tr></thead><tbody>
        {accounts.map((a) => <tr key={a.id}><td>{a.id}</td><td>{a.name}</td><td>{a.owner}</td><td>{money(a.balance)}</td>
          <td><button className="ghost" onClick={() => openStatement(a.id)}>Statement</button></td></tr>)}
      </tbody></table></div>

    {canMove && <div className="card"><h2>Move money</h2>
      <input placeholder="Account ID" value={f.accountId} onChange={(e) => setF({ ...f, accountId: e.target.value })} />
      <input placeholder="Amount (e.g. 25.00)" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} />
      <input placeholder="To account (transfer)" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} /><br />
      <button onClick={() => run(() => post(`/api/accounts/${f.accountId}/deposit`, { amount: cents() }), 'Deposit complete')}>Deposit</button>
      <button onClick={() => run(() => post(`/api/accounts/${f.accountId}/withdraw`, { amount: cents() }), 'Withdrawal complete')}>Withdraw</button>
      <button onClick={() => run(() => post('/api/transfers', { fromAccountId: +f.accountId, toAccountId: +f.to, amount: cents() }), 'Transfer complete')}>Transfer</button>
    </div>}

    {me.role === 'ADMIN' && <div className="card"><h2>Create account</h2>
      <input placeholder="Owner username" value={f.owner} onChange={(e) => setF({ ...f, owner: e.target.value })} />
      <input placeholder="Account name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
      <button onClick={() => run(() => post('/api/accounts', { ownerUsername: f.owner, name: f.name }), 'Account created')}>Create</button></div>}

    {stmt && <div className="card"><div className="row"><h2>Statement · account {stmt.id}</h2><button className="ghost" onClick={() => setStmt(null)}>Close</button></div>
      <table><thead><tr><th>Txn</th><th>Type</th><th>Amount</th><th>Balance</th><th>When</th></tr></thead><tbody>
        {stmt.rows.map((r) => <tr key={r.id}><td>{r.txn_id}</td><td>{r.type}</td><td>{money(r.amount)}</td><td>{money(r.balance_after)}</td><td>{r.created_at.slice(0, 19)}</td></tr>)}
      </tbody></table></div>}
  </>)
}

function Audit({ call }) {
  const [rows, setRows] = useState([]); const [cons, setCons] = useState(null)
  useEffect(() => { call('/api/audit').then(setRows).catch(() => {}); call('/api/admin/conservation').then(setCons).catch(() => {}) }, [call])
  return (<div className="card"><h2>Audit trail</h2>
    {cons && <p className={cons.ok ? 'ok' : 'err'}>Money conservation: {cons.ok ? 'OK (balances and entries net to zero)' : 'MISMATCH'}</p>}
    <table><thead><tr><th>ID</th><th>Actor</th><th>Action</th><th>Detail</th></tr></thead><tbody>
      {rows.map((r) => <tr key={r.id}><td>{r.id}</td><td>{r.actor}</td><td>{r.action}</td><td>{r.detail}</td></tr>)}
    </tbody></table></div>)
}
