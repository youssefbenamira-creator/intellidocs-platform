"use client";

import { useEffect, useState } from 'react';
import { fetchWithAuth } from '@/lib/apiClient';

interface User {
  id: number;
  email: string;
  role: string;
  isActive: boolean;
  createdAt: string;
}

export default function UsersManagementPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({ email: '', password: '', role: 'EXPERT' });
  const [errorMsg, setErrorMsg] = useState('');

  const loadUsers = async () => {
    try {
      const res = await fetchWithAuth('/users');
      if (res.ok) {
        setUsers(await res.json());
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadUsers(); }, []);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    const res = await fetchWithAuth('/users', {
      method: 'POST',
      body: JSON.stringify(formData),
    });
    if (res.ok) {
      setIsModalOpen(false);
      setFormData({ email: '', password: '', role: 'EXPERT' });
      loadUsers();
    } else {
      const err = await res.json();
      setErrorMsg(Array.isArray(err.message) ? err.message[0] : err.message);
    }
  };

  const handleToggleStatus = async (id: number, currentStatus: boolean) => {
    await fetchWithAuth(`/users/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ isActive: !currentStatus }),
    });
    loadUsers();
  };

  const handleDelete = async (id: number) => {
    if (confirm("Are you sure you want to delete this user?")) {
      await fetchWithAuth(`/users/${id}`, { method: 'DELETE' });
      loadUsers();
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <p className="text-slate-400">Manage all registered accounts, assign roles, and revoke access.</p>
        <button onClick={() => setIsModalOpen(true)} className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-lg shadow-[0_0_15px_rgba(79,70,229,0.4)] transition-all hover:scale-105 active:scale-95">
          + Create New User
        </button>
      </div>

      <div className="bg-slate-800/40 backdrop-blur-md border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-white/5 border-b border-white/10">
              <th className="py-4 px-6 text-sm font-semibold text-slate-300">User Email</th>
              <th className="py-4 px-6 text-sm font-semibold text-slate-300">Role</th>
              <th className="py-4 px-6 text-sm font-semibold text-slate-300">Status</th>
              <th className="py-4 px-6 text-sm font-semibold text-slate-300 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="py-8 text-center text-slate-400 animate-pulse">Loading...</td></tr>
            ) : users.map((user) => (
              <tr key={user.id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                <td className="py-4 px-6">
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-xs font-bold text-slate-300 border border-slate-600">
                      {user.email.charAt(0).toUpperCase()}
                    </div>
                    <span className="font-medium text-slate-200">{user.email}</span>
                  </div>
                </td>
                <td className="py-4 px-6">
                  <span className={`px-3 py-1 text-xs font-bold rounded-full ${
                    user.role === 'ADMIN' ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30' :
                    user.role === 'EXPERT' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                    'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                  }`}>
                    {user.role}
                  </span>
                </td>
                <td className="py-4 px-6">
                  <button onClick={() => handleToggleStatus(user.id, user.isActive)} className="flex items-center space-x-2 px-2 py-1 hover:bg-white/5 rounded-lg transition">
                    <div className={`w-2 h-2 rounded-full ${user.isActive ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]' : 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]'}`}></div>
                    <span className="text-sm text-slate-300">{user.isActive ? 'Active' : 'Revoked'}</span>
                  </button>
                </td>
                <td className="py-4 px-6 text-right">
                  <button onClick={() => handleDelete(user.id)} className="text-slate-400 hover:text-red-400 transition-colors">Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-slate-900 border border-white/10 p-8 rounded-2xl w-full max-w-md shadow-2xl">
            <h2 className="text-xl font-bold text-white mb-6">Create New User</h2>
            {errorMsg && <p className="text-red-400 text-sm mb-4 bg-red-500/10 p-3 rounded-lg border border-red-500/20">{errorMsg}</p>}
            <form onSubmit={handleCreateUser} className="space-y-4">
              <div>
                <label className="block text-sm text-slate-400 mb-1">Email</label>
                <input type="email" required value={formData.email} onChange={(e)=>setFormData({...formData, email: e.target.value})} className="w-full bg-slate-800 border border-white/10 rounded-lg px-4 py-2 text-white outline-none focus:border-indigo-500 transition" />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Temporary Password</label>
                <input type="text" required value={formData.password} onChange={(e)=>setFormData({...formData, password: e.target.value})} className="w-full bg-slate-800 border border-white/10 rounded-lg px-4 py-2 text-white outline-none focus:border-indigo-500 transition" />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Role</label>
                <select value={formData.role} onChange={(e)=>setFormData({...formData, role: e.target.value})} className="w-full bg-slate-800 border border-white/10 rounded-lg px-4 py-2 text-white outline-none focus:border-indigo-500 transition">
                  <option value="EXPERT">Expert</option>
                  <option value="DECISION_MAKER">Decision Maker</option>
                  <option value="ADMIN">Admin</option>
                </select>
              </div>
              <div className="flex space-x-3 pt-4">
                <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 py-2 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 transition">Cancel</button>
                <button type="submit" className="flex-1 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 transition font-medium">Create</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
