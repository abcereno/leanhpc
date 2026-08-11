import { useState } from 'react'
import { supabase } from '../../supabaseClient'

export default function InviteAdmin() {
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')

  const inviteAdmin = async (e) => {
    e.preventDefault()

    const { error } = await supabase.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${window.location.origin}/update-password`
    })

    setMessage(error ? error.message : `Invite sent to ${email}`)
  }

  return (
    <div className="container mt-5">
      <h2>Invite New Admin</h2>
      <form onSubmit={inviteAdmin}>
        <div className="form-group my-2">
          <input type="email" className="form-control" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} required />
        </div>
        <button className="btn btn-dark" type="submit">Send Admin Invite</button>
        <p className="text-info mt-2">{message}</p>
      </form>
    </div>
  )
}
