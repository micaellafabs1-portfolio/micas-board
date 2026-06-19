'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';

const LABEL_OPTIONS = [
  { value: 'None', text: 'None' },
  { value: 'Urgent', text: 'Urgent' },
  { value: 'High', text: 'High' },
  { value: 'Medium', text: 'Medium' },
  { value: 'Supplier', text: 'Awaiting Supplier Response' },
  { value: 'Response', text: 'Awaiting Client Response' },
  { value: 'Done', text: 'Done' },
];

const LABEL_STYLES = {
  Urgent:   { bg: '#FF3B3B', text: '#FFFFFF' },
  High:     { bg: '#FF8C00', text: '#FFFFFF' },
  Medium:   { bg: '#D4A800', text: '#FFFFFF' },
  Supplier: { bg: '#1A7FE8', text: '#FFFFFF' },
  Response: { bg: '#9B59F5', text: '#FFFFFF' },
  Done:     { bg: '#16A34A', text: '#FFFFFF' },
};

const AVATAR_COLORS = ['#5C2D91','#B04632','#216E4E','#974F0C','#943EBC'];

function getInitials(name) {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 4, flexShrink: 0 }}>
      <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" />
    </svg>
  );
}

function DocIcon() {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="#7C8798" strokeWidth="2" style={{ marginRight: 6, flexShrink: 0, marginTop: 1 }}>
      <path d="M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9z" /><path d="M14 3v6h6" />
    </svg>
  );
}

export default function BoardPage() {
  const [lists, setLists]     = useState([]);
  const [cards, setCards]     = useState([]);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  const [editingCard, setEditingCard]         = useState(null);
  const [deleteConfirmCard, setDeleteConfirmCard] = useState(false);
  const [showShare, setShowShare]             = useState(false);
  const [inviteVal, setInviteVal]             = useState('');
  const [toast, setToast]                     = useState('');
  const [copyState, setCopyState]             = useState(null);
  const [lastAction, setLastAction]           = useState(null);
  const [editingListId, setEditingListId]     = useState(null);
  const [editingListTitle, setEditingListTitle] = useState('');
  const [showAddList, setShowAddList]         = useState(false);
  const [newListTitle, setNewListTitle]       = useState('');
  const [newListEmoji, setNewListEmoji]       = useState('📌');
  const [memberToDelete, setMemberToDelete]   = useState(null);

  // Drag state stored in refs to avoid stale closures
  const dragCardId   = useRef(null);
  const dragFromList = useRef(null);
  const [dragOverInfo, setDragOverInfo] = useState(null);

  useEffect(() => { loadAll(); }, []);

  useEffect(() => {
    function onKeyDown(e) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        handleUndo();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [lastAction]);

  async function loadAll() {
    setLoading(true); setErrorMsg('');
    try {
      const [lr, cr, mr] = await Promise.all([
        supabase.from('lists').select('*').order('position', { ascending: true }),
        supabase.from('cards').select('*').order('position', { ascending: true }),
        supabase.from('members').select('*').order('created_at', { ascending: true }),
      ]);
      if (lr.error) throw lr.error;
      if (cr.error) throw cr.error;
      if (mr.error) throw mr.error;
      setLists(lr.data || []);
      setCards(cr.data || []);
      setMembers(mr.data || []);
    } catch (e) {
      console.error(e);
      setErrorMsg('Could not load the board. Check that NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are set correctly, and that the schema/seed SQL has been run in Supabase.');
    }
    setLoading(false);
  }

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 2500); };

  const cardsForList = useCallback(
    (listId) => cards.filter(c => c.list_id === listId).sort((a, b) => a.position - b.position),
    [cards]
  );

  function computeNewPosition(listId, targetIndex, excludeCardId = null) {
    let lc = cards.filter(c => c.list_id === listId).sort((a, b) => a.position - b.position);
    if (excludeCardId) lc = lc.filter(c => c.id !== excludeCardId);
    if (lc.length === 0) return 1;
    if (targetIndex <= 0) return lc[0].position - 1;
    if (targetIndex >= lc.length) return lc[lc.length - 1].position + 1;
    return (lc[targetIndex - 1].position + lc[targetIndex].position) / 2;
  }

  // ---------- Drag & drop ----------
  function handleDragStart(e, cardId, fromListId) {
    dragCardId.current   = cardId;
    dragFromList.current = fromListId;
    e.dataTransfer.effectAllowed = 'move';
    // small delay so the card doesn't look grabbed as a ghost
    setTimeout(() => {
      const el = document.getElementById('card-' + cardId);
      if (el) el.style.opacity = '0.4';
    }, 0);
  }

  function handleDragEnd(cardId) {
    const el = document.getElementById('card-' + cardId);
    if (el) el.style.opacity = '1';
    setDragOverInfo(null);
  }

  function handleDragOverCard(e, listId, index) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverInfo({ listId, index });
  }

  function handleDragOverList(e, listId) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const count = cards.filter(c => c.list_id === listId).length;
    setDragOverInfo({ listId, index: count });
  }

  async function handleDrop(e, toListId) {
    e.preventDefault();
    const cardId     = dragCardId.current;
    const fromListId = dragFromList.current;
    dragCardId.current   = null;
    dragFromList.current = null;

    if (!cardId || !toListId) { setDragOverInfo(null); return; }

    // Restore opacity
    const el = document.getElementById('card-' + cardId);
    if (el) el.style.opacity = '1';

    const dropIndex = dragOverInfo?.listId === toListId ? dragOverInfo.index : cards.filter(c => c.list_id === toListId).length;
    setDragOverInfo(null);

    // Compute position excluding the card being moved
    const newPos = computeNewPosition(toListId, dropIndex, cardId);

    const prevCard = cards.find(c => c.id === cardId);
    if (!prevCard) return;

    // Optimistic update
    setCards(prev => prev.map(c =>
      c.id === cardId ? { ...c, list_id: toListId, position: newPos } : c
    ));

    const { error } = await supabase
      .from('cards')
      .update({ list_id: toListId, position: newPos, updated_at: new Date().toISOString() })
      .eq('id', cardId);

    if (error) {
      console.error('Drop save error:', error);
      // Revert
      setCards(prev => prev.map(c =>
        c.id === cardId ? { ...c, list_id: prevCard.list_id, position: prevCard.position } : c
      ));
      showToast('Failed to save move — try again');
    } else {
      setLastAction({ label: 'Move card', undo: async () => {
        await supabase.from('cards').update({ list_id: prevCard.list_id, position: prevCard.position, updated_at: new Date().toISOString() }).eq('id', cardId);
        setCards(prev => prev.map(c => c.id === cardId ? { ...c, list_id: prevCard.list_id, position: prevCard.position } : c));
      }});
      showToast('Card moved');
    }
  }

  // ---------- Add card ----------
  async function addCard(listId) {
    const lc = cardsForList(listId);
    const newPos = lc.length ? lc[lc.length - 1].position + 1 : 1;
    const { data, error } = await supabase
      .from('cards')
      .insert({ list_id: listId, title: 'New card', label: 'None', position: newPos })
      .select().single();
    if (error) { console.error(error); showToast('Failed to add card'); return; }
    setCards(prev => [...prev, data]);
    setEditingCard({ ...data });
    setDeleteConfirmCard(false);
    setLastAction({ label: 'Add card', undo: async () => {
      await supabase.from('cards').delete().eq('id', data.id);
      setCards(prev => prev.filter(c => c.id !== data.id));
      setEditingCard(null);
    }});
  }

  // ---------- Card modal ----------
  function openCardModal(card) { setEditingCard({ ...card }); setDeleteConfirmCard(false); }
  function closeCardModal()    { setEditingCard(null); setDeleteConfirmCard(false); }

  async function saveEditingCard() {
    if (!editingCard) return;
    const { id, title, label, due_date, description } = editingCard;
    const prevCard = cards.find(c => c.id === id);
    const { error } = await supabase.from('cards').update({
      title: title?.trim() || 'Untitled', label,
      due_date: due_date || null,
      description: description || '',
      updated_at: new Date().toISOString(),
    }).eq('id', id);
    if (error) { console.error(error); showToast('Save failed'); return; }
    setCards(prev => prev.map(c => c.id === id
      ? { ...c, title: title?.trim() || 'Untitled', label, due_date: due_date || null, description: description || '' }
      : c));
    setLastAction({ label: 'Edit card', undo: async () => {
      await supabase.from('cards').update({ title: prevCard.title, label: prevCard.label, due_date: prevCard.due_date, description: prevCard.description, updated_at: new Date().toISOString() }).eq('id', id);
      setCards(prev => prev.map(c => c.id === id ? { ...c, ...prevCard } : c));
    }});
    showToast('Saved');
    setEditingCard(null);
  }

  async function deleteCard(cardId) {
    const prevCard = cards.find(c => c.id === cardId);
    const { error } = await supabase.from('cards').delete().eq('id', cardId);
    if (error) { console.error(error); showToast('Delete failed'); return; }
    setCards(prev => prev.filter(c => c.id !== cardId));
    setEditingCard(null); setDeleteConfirmCard(false);
    setLastAction({ label: 'Delete card', undo: async () => {
      const { data } = await supabase.from('cards').insert({ ...prevCard, id: undefined }).select().single();
      if (data) setCards(prev => [...prev, data]);
    }});
    showToast('Card deleted');
  }

  // ---------- Copy card ----------
  function openCopyModal(card) {
    setCopyState({ card, title: card.title, targetListId: card.list_id, targetPosition: cardsForList(card.list_id).length });
  }

  async function confirmCopyCard() {
    if (!copyState) return;
    const { card, title, targetListId, targetPosition } = copyState;
    const newPos = computeNewPosition(targetListId, targetPosition);
    const { data, error } = await supabase.from('cards').insert({
      list_id: targetListId, title: title?.trim() || card.title,
      label: card.label, due_date: card.due_date, description: card.description, position: newPos,
    }).select().single();
    if (error) { console.error(error); showToast('Copy failed'); return; }
    setCards(prev => [...prev, data]);
    setCopyState(null);
    setLastAction({ label: 'Copy card', undo: async () => {
      await supabase.from('cards').delete().eq('id', data.id);
      setCards(prev => prev.filter(c => c.id !== data.id));
    }});
    showToast('Card copied');
  }

  // ---------- Add list (inline form, no prompt) ----------
  async function confirmAddList() {
    const title = newListTitle.trim();
    if (!title) return;
    const newPos = lists.length ? lists[lists.length - 1].position + 1 : 0;
    const { data, error } = await supabase
      .from('lists')
      .insert({ title, emoji: newListEmoji, type: 'normal', position: newPos })
      .select().single();
    if (error) { console.error(error); showToast('Failed to add list'); return; }
    setLists(prev => [...prev, data]);
    setNewListTitle(''); setNewListEmoji('📌'); setShowAddList(false);
    setLastAction({ label: 'Add list', undo: async () => {
      await supabase.from('lists').delete().eq('id', data.id);
      setLists(prev => prev.filter(l => l.id !== data.id));
    }});
    showToast('List added');
  }

  // ---------- Edit list title ----------
  function startEditListTitle(list) { setEditingListId(list.id); setEditingListTitle(list.title); }

  async function saveListTitle(listId) {
    const title = editingListTitle.trim();
    if (!title) { setEditingListId(null); return; }
    const prev = lists.find(l => l.id === listId);
    const { error } = await supabase.from('lists').update({ title }).eq('id', listId);
    if (error) { console.error(error); showToast('Failed to rename'); return; }
    setLists(l => l.map(x => x.id === listId ? { ...x, title } : x));
    setEditingListId(null);
    setLastAction({ label: 'Rename list', undo: async () => {
      await supabase.from('lists').update({ title: prev.title }).eq('id', listId);
      setLists(l => l.map(x => x.id === listId ? { ...x, title: prev.title } : x));
    }});
  }

  // ---------- Delete list ----------
  async function deleteList(listId) {
    const prevList  = lists.find(l => l.id === listId);
    const prevCards = cards.filter(c => c.list_id === listId);
    const { error } = await supabase.from('lists').delete().eq('id', listId);
    if (error) { console.error(error); showToast('Failed to delete list'); return; }
    setLists(prev => prev.filter(l => l.id !== listId));
    setCards(prev => prev.filter(c => c.list_id !== listId));
    setLastAction({ label: 'Delete list', undo: async () => {
      const { data } = await supabase.from('lists').insert({ ...prevList, id: undefined }).select().single();
      if (data) {
        setLists(prev => [...prev, data]);
        if (prevCards.length) {
          const { data: nc } = await supabase.from('cards').insert(prevCards.map(c => ({ ...c, id: undefined, list_id: data.id }))).select();
          if (nc) setCards(prev => [...prev, ...nc]);
        }
      }
    }});
    showToast('List deleted');
  }

  // ---------- Members ----------
  async function handleInvite() {
    const val = inviteVal.trim();
    if (!val) return;
    let name = val;
    if (val.includes('@')) name = val.split('@')[0].replace(/[._]/g, ' ');
    name = name.replace(/\b\w/g, c => c.toUpperCase());
    if (members.some(m => m.name.toLowerCase() === name.toLowerCase())) {
      showToast(`${name} is already on this board`); setInviteVal(''); return;
    }
    const color = AVATAR_COLORS[members.length % AVATAR_COLORS.length];
    const { data, error } = await supabase.from('members')
      .insert({ name, initials: getInitials(name), color, role: 'Member' }).select().single();
    if (error) { console.error(error); showToast('Failed to add member'); return; }
    setMembers(prev => [...prev, data]);
    setInviteVal('');
    showToast(`${name} added. Send them the board URL to give access.`);
  }

  async function confirmDeleteMember(member) {
    const { error } = await supabase.from('members').delete().eq('id', member.id);
    if (error) { console.error(error); showToast('Failed to remove member'); return; }
    setMembers(prev => prev.filter(m => m.id !== member.id));
    setMemberToDelete(null);
    showToast(`${member.name} removed`);
  }

  // ---------- Undo ----------
  async function handleUndo() {
    if (!lastAction) return;
    try { await lastAction.undo(); showToast(`Undid: ${lastAction.label}`); }
    catch (e) { console.error(e); showToast('Undo failed'); }
    setLastAction(null);
  }

  if (loading) return <div style={{ ...shellStyle, alignItems: 'center', justifyContent: 'center' }}><div style={{ color: '#7C8798', fontFamily: 'sans-serif' }}>Loading board…</div></div>;
  if (errorMsg) return <div style={{ ...shellStyle, padding: 24 }}><div style={{ color: '#FF5C5C', fontFamily: 'sans-serif', lineHeight: 1.6, maxWidth: 600 }}>{errorMsg}</div></div>;

  return (
    <div style={shellStyle}>
      {/* Sidebar */}
      <div style={sidebarStyle}>
        <div style={logoMarkStyle}>M</div>
        <div style={{ ...sideIconStyle, background: 'rgba(59,158,255,.15)', color: '#3B9EFF' }}>▦</div>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* Topbar */}
        <div style={topbarStyle}>
          <div style={{ fontSize: 17, fontWeight: 700 }}>Mica's Board</div>
          <div style={liveTagStyle}><span style={liveDotStyle} />Live</div>
          {lastAction && (
            <button onClick={handleUndo} style={undoBtnStyle}>↩ Undo: {lastAction.label}</button>
          )}
          <div style={{ flex: 1 }} />
          <div style={{ display: 'flex', alignItems: 'center' }}>
            {members.map((m, i) => (
              <div key={m.id} title={`${m.name} — click to remove`}
                onClick={() => setMemberToDelete(m)}
                style={{ ...avatarStyle, background: m.color, marginLeft: i === 0 ? 0 : -8, cursor: 'pointer' }}>
                {m.initials}
              </div>
            ))}
          </div>
          <div onClick={() => setShowShare(true)}
            style={{ ...addMemberBtnStyle, marginLeft: members.length ? -8 : 0 }} title="Add member">+</div>
          <button onClick={() => setShowShare(true)} style={topBtnStyle}>Share</button>
        </div>

        {/* Board */}
        <div style={boardCanvasStyle}>
          {lists.map(list => {
            const listCards = cardsForList(list.id);
            const isTemplates = list.type === 'templates';
            const isOver = dragOverInfo?.listId === list.id;
            return (
              <div key={list.id}
                onDragOver={e => handleDragOverList(e, list.id)}
                onDrop={e => handleDrop(e, list.id)}
                style={{ ...listStyle,
                  background: isTemplates ? 'linear-gradient(180deg,rgba(74,222,128,.05),#161B22 40%)' : '#161B22',
                  borderColor: isOver ? '#3B9EFF' : isTemplates ? 'rgba(74,222,128,.25)' : '#272E3A',
                }}>

                {/* List header */}
                <div style={listHeaderStyle}>
                  <span style={{ fontSize: 14 }}>{list.emoji}</span>
                  {editingListId === list.id ? (
                    <input autoFocus value={editingListTitle}
                      onChange={e => setEditingListTitle(e.target.value)}
                      onBlur={() => saveListTitle(list.id)}
                      onKeyDown={e => { if (e.key === 'Enter') saveListTitle(list.id); if (e.key === 'Escape') setEditingListId(null); }}
                      style={{ background: 'transparent', border: 'none', borderBottom: '1px solid #3B9EFF', color: '#E6E9EF', fontSize: 13.5, fontWeight: 600, outline: 'none', flex: 1, padding: '0 2px' }} />
                  ) : (
                    <span style={{ flex: 1, cursor: 'pointer' }} onDoubleClick={() => startEditListTitle(list)} title="Double-click to rename">{list.title}</span>
                  )}
                  <span style={countStyle}>{listCards.length}</span>
                  <span onClick={() => deleteList(list.id)} title="Delete list"
                    style={{ color: '#4D5566', cursor: 'pointer', fontSize: 13, padding: '2px 4px', borderRadius: 4, flexShrink: 0 }}>✕</span>
                </div>

                {/* Cards */}
                <div style={cardsContainerStyle}>
                  {listCards.map((card, idx) => {
                    const lStyle = LABEL_STYLES[card.label];
                    const showLine = isOver && dragOverInfo?.index === idx;
                    return (
                      <div key={card.id}>
                        {showLine && <div style={dropLineStyle} />}
                        <div
                          id={'card-' + card.id}
                          draggable
                          onDragStart={e => handleDragStart(e, card.id, list.id)}
                          onDragEnd={() => handleDragEnd(card.id)}
                          onDragOver={e => handleDragOverCard(e, list.id, idx)}
                          onDrop={e => { e.stopPropagation(); handleDrop(e, list.id); }}
                          onClick={() => openCardModal(card)}
                          style={{ ...cardStyle,
                            borderLeft: card.label === 'Urgent' ? '3px solid #FF3B3B'
                              : isTemplates ? '2px solid #4ADE80' : '1px solid #272E3A',
                          }}>
                          {card.label !== 'None' && lStyle && (
                            <span style={{ ...labelPillStyle, background: lStyle.bg, color: lStyle.text }}>
                              {LABEL_OPTIONS.find(o => o.value === card.label)?.text}
                            </span>
                          )}
                          <div style={cardTitleStyle}>
                            {isTemplates && <DocIcon />}
                            {card.title}
                          </div>
                          {card.due_date && (
                            <div style={cardMetaStyle}><ClockIcon />{formatDate(card.due_date)}</div>
                          )}
                          <div onClick={e => { e.stopPropagation(); openCopyModal(card); }}
                            style={copyBtnStyle} title="Copy card">⧉</div>
                        </div>
                      </div>
                    );
                  })}
                  {isOver && dragOverInfo?.index === listCards.length && <div style={dropLineStyle} />}
                </div>

                <div onClick={() => addCard(list.id)} style={addCardBtnStyle}>+ Add a card</div>
              </div>
            );
          })}

          {/* Add list */}
          {showAddList ? (
            <div style={{ ...listStyle, width: 272, flexShrink: 0, padding: 14 }}>
              <div style={fieldLabelStyle}>Emoji</div>
              <input value={newListEmoji} onChange={e => setNewListEmoji(e.target.value)}
                style={{ ...inputStyle, width: 56, textAlign: 'center', fontSize: 18, marginBottom: 12 }} maxLength={2} />
              <div style={fieldLabelStyle}>List name</div>
              <input autoFocus value={newListTitle}
                onChange={e => setNewListTitle(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') confirmAddList(); if (e.key === 'Escape') setShowAddList(false); }}
                placeholder="e.g. On Hold" style={{ ...inputStyle, marginBottom: 12 }} />
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={confirmAddList} style={{ ...topBtnStyle, flex: 1, justifyContent: 'center' }}>Add list</button>
                <button onClick={() => { setShowAddList(false); setNewListTitle(''); setNewListEmoji('📌'); }}
                  style={{ background: '#272E3A', border: 'none', color: '#7C8798', borderRadius: 7, padding: '8px 12px', cursor: 'pointer', fontSize: 13 }}>Cancel</button>
              </div>
            </div>
          ) : (
            <div onClick={() => setShowAddList(true)} style={addListStyle}>+ Add another list</div>
          )}
        </div>
      </div>

      {/* Card modal */}
      {editingCard && (
        <div style={overlayStyle} onClick={e => e.target === e.currentTarget && closeCardModal()}>
          <div style={modalStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14, gap: 10 }}>
              <input value={editingCard.title}
                onChange={e => setEditingCard({ ...editingCard, title: e.target.value })}
                style={{ background: 'transparent', border: 'none', borderBottom: '1px solid #3B9EFF', color: '#E6E9EF', fontSize: 16, fontWeight: 600, width: '100%', outline: 'none', paddingBottom: 4, fontFamily: 'inherit' }} />
              <button onClick={closeCardModal} style={modalCloseStyle}>✕</button>
            </div>
            <div style={fieldLabelStyle}>Label</div>
            <select value={editingCard.label} onChange={e => setEditingCard({ ...editingCard, label: e.target.value })} style={inputStyle}>
              {LABEL_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.text}</option>)}
            </select>
            <div style={fieldLabelStyle}>Due date</div>
            <input type="date" value={editingCard.due_date || ''} onChange={e => setEditingCard({ ...editingCard, due_date: e.target.value })} style={inputStyle} />
            <div style={fieldLabelStyle}>Description</div>
            <textarea value={editingCard.description || ''} onChange={e => setEditingCard({ ...editingCard, description: e.target.value })}
              rows={6} style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.7, fontFamily: 'inherit' }} />
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button onClick={saveEditingCard} style={{ ...topBtnStyle, flex: 1, justifyContent: 'center', minWidth: 80 }}>Save</button>
              {!deleteConfirmCard ? (
                <button onClick={() => setDeleteConfirmCard(true)}
                  style={{ background: '#1B212B', border: '1px solid rgba(255,92,92,.35)', color: '#FF5C5C', borderRadius: 7, padding: '9px 16px', fontSize: 13, cursor: 'pointer' }}>
                  Delete
                </button>
              ) : (
                <>
                  <button onClick={() => deleteCard(editingCard.id)}
                    style={{ background: '#FF3B3B', border: 'none', color: '#fff', borderRadius: 7, padding: '9px 14px', fontSize: 13, cursor: 'pointer', fontWeight: 600 }}>
                    Confirm
                  </button>
                  <button onClick={() => setDeleteConfirmCard(false)}
                    style={{ background: '#272E3A', border: 'none', color: '#7C8798', borderRadius: 7, padding: '9px 12px', fontSize: 13, cursor: 'pointer' }}>
                    Cancel
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Copy modal */}
      {copyState && (
        <div style={overlayStyle} onClick={e => e.target === e.currentTarget && setCopyState(null)}>
          <div style={modalStyle}>
            <div style={{ fontSize: 17, fontWeight: 600, marginBottom: 4 }}>Copy card</div>
            <div style={{ fontSize: 13, color: '#7C8798', marginBottom: 16 }}>Copying "{copyState.card.title}"</div>
            <div style={fieldLabelStyle}>Name</div>
            <input value={copyState.title} onChange={e => setCopyState({ ...copyState, title: e.target.value })} style={inputStyle} />
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ flex: 1 }}>
                <div style={fieldLabelStyle}>List</div>
                <select value={copyState.targetListId}
                  onChange={e => setCopyState({ ...copyState, targetListId: e.target.value, targetPosition: cardsForList(e.target.value).length })}
                  style={inputStyle}>
                  {lists.map(l => <option key={l.id} value={l.id}>{l.emoji} {l.title}</option>)}
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <div style={fieldLabelStyle}>Position</div>
                <select value={copyState.targetPosition}
                  onChange={e => setCopyState({ ...copyState, targetPosition: parseInt(e.target.value, 10) })}
                  style={inputStyle}>
                  {Array.from({ length: cardsForList(copyState.targetListId).length + 1 }).map((_, i) => (
                    <option key={i} value={i}>{i + 1}</option>
                  ))}
                </select>
              </div>
            </div>
            <button onClick={confirmCopyCard} style={{ ...topBtnStyle, width: '100%', justifyContent: 'center', marginTop: 4 }}>Create card</button>
          </div>
        </div>
      )}

      {/* Share modal */}
      {showShare && (
        <div style={overlayStyle} onClick={e => e.target === e.currentTarget && setShowShare(false)}>
          <div style={modalStyle}>
            <div style={{ fontSize: 17, fontWeight: 600, marginBottom: 4 }}>Share board</div>
            <div style={{ fontSize: 13, color: '#7C8798', marginBottom: 16 }}>Anyone with the link can view and edit. Send them the URL directly.</div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              <input value={inviteVal} onChange={e => setInviteVal(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleInvite()}
                placeholder="Name or email" style={{ ...inputStyle, marginBottom: 0, flex: 1 }} />
              <button onClick={handleInvite} style={topBtnStyle}>Add</button>
            </div>
            <div style={{ fontSize: 12.5, color: '#7C8798', marginBottom: 10 }}>Members on this board</div>
            {members.map(m => (
              <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0' }}>
                <div style={{ ...avatarStyle, width: 26, height: 26, fontSize: 10.5, background: m.color }}>{m.initials}</div>
                <div style={{ flex: 1, fontSize: 13.5 }}>{m.name}</div>
                <div style={{ fontSize: 11.5, color: '#7C8798' }}>{m.role}</div>
                {m.role !== 'Admin' && (
                  <button onClick={() => { setShowShare(false); setMemberToDelete(m); }}
                    style={{ background: 'none', border: '1px solid rgba(255,92,92,.3)', color: '#FF5C5C', borderRadius: 6, padding: '4px 10px', fontSize: 12, cursor: 'pointer' }}>
                    Remove
                  </button>
                )}
              </div>
            ))}
            <button onClick={() => setShowShare(false)}
              style={{ marginTop: 14, width: '100%', background: '#1B212B', border: '1px solid #272E3A', color: '#E6E9EF', borderRadius: 7, padding: 9, fontSize: 13, cursor: 'pointer' }}>
              Close
            </button>
          </div>
        </div>
      )}

      {/* Remove member confirm */}
      {memberToDelete && (
        <div style={overlayStyle} onClick={e => e.target === e.currentTarget && setMemberToDelete(null)}>
          <div style={{ ...modalStyle, maxWidth: 360 }}>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Remove member?</div>
            <div style={{ fontSize: 13.5, color: '#7C8798', marginBottom: 20 }}>
              Remove <strong style={{ color: '#E6E9EF' }}>{memberToDelete.name}</strong> from this board?
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => confirmDeleteMember(memberToDelete)}
                style={{ background: '#FF3B3B', border: 'none', color: '#fff', borderRadius: 7, padding: '9px 16px', fontSize: 13, cursor: 'pointer', fontWeight: 600, flex: 1 }}>
                Remove
              </button>
              <button onClick={() => setMemberToDelete(null)}
                style={{ background: '#272E3A', border: 'none', color: '#7C8798', borderRadius: 7, padding: '9px 14px', fontSize: 13, cursor: 'pointer' }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <div style={toastStyle}>{toast}</div>}
    </div>
  );
}

const shellStyle = { display: 'flex', height: '100vh', fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif', background: '#0E1116', color: '#E6E9EF', overflow: 'hidden' };
const sidebarStyle = { width: 56, flex: '0 0 56px', background: '#161B22', borderRight: '1px solid #272E3A', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '16px 0', gap: 8 };
const logoMarkStyle = { width: 30, height: 30, borderRadius: 7, background: 'linear-gradient(135deg,#3B9EFF,#7C5CFF)', marginBottom: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 13, color: '#fff' };
const sideIconStyle = { width: 36, height: 36, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 16 };
const topbarStyle = { height: 60, flex: '0 0 60px', display: 'flex', alignItems: 'center', padding: '0 22px', gap: 14, borderBottom: '1px solid #272E3A' };
const liveTagStyle = { fontSize: 11, color: '#7C8798', display: 'flex', alignItems: 'center', gap: 6, background: '#1B212B', border: '1px solid #272E3A', borderRadius: 20, padding: '4px 10px 4px 8px' };
const liveDotStyle = { width: 7, height: 7, borderRadius: '50%', background: '#4ADE80', boxShadow: '0 0 0 3px rgba(74,222,128,.18)', display: 'inline-block' };
const undoBtnStyle = { background: '#1B212B', border: '1px solid #3B9EFF', color: '#3B9EFF', borderRadius: 7, padding: '6px 12px', fontSize: 12, cursor: 'pointer' };
const avatarStyle = { width: 30, height: 30, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#fff', border: '2px solid #0E1116', flexShrink: 0 };
const addMemberBtnStyle = { width: 30, height: 30, borderRadius: '50%', background: '#1B212B', border: '1.5px dashed #4D5566', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#7C8798', cursor: 'pointer', fontSize: 15 };
const topBtnStyle = { background: '#3B9EFF', color: '#fff', border: 'none', borderRadius: 7, padding: '8px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 };
const boardCanvasStyle = { flex: 1, overflowX: 'auto', overflowY: 'hidden', padding: 20, display: 'flex', alignItems: 'flex-start', gap: 14 };
const listStyle = { width: 272, flex: '0 0 272px', border: '1px solid #272E3A', borderRadius: 10, maxHeight: '100%', display: 'flex', flexDirection: 'column', padding: '12px 10px 10px 10px', transition: 'border-color .15s' };
const listHeaderStyle = { display: 'flex', alignItems: 'center', gap: 7, padding: '2px 6px 12px 6px', fontSize: 13.5, fontWeight: 600 };
const countStyle = { color: '#7C8798', fontWeight: 500, fontSize: 11.5, background: 'rgba(255,255,255,.04)', borderRadius: 10, padding: '1px 7px' };
const cardsContainerStyle = { overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 8, paddingBottom: 4, minHeight: 24 };
const cardStyle = { background: '#1B212B', border: '1px solid #272E3A', borderRadius: 9, padding: '11px 30px 12px 12px', cursor: 'grab', position: 'relative' };
const dropLineStyle = { height: 3, background: '#3B9EFF', borderRadius: 2, margin: '0 2px 8px 2px' };
const labelPillStyle = { display: 'inline-block', fontSize: 11.5, fontWeight: 700, borderRadius: 5, padding: '4px 10px', marginBottom: 8, letterSpacing: '.15px' };
const cardTitleStyle = { fontSize: 13.5, color: '#E6E9EF', lineHeight: 1.4, marginBottom: 6, fontWeight: 500, display: 'flex', alignItems: 'flex-start' };
const cardMetaStyle = { display: 'flex', alignItems: 'center', fontSize: 11.5, color: '#7C8798' };
const copyBtnStyle = { position: 'absolute', top: 8, right: 8, width: 20, height: 20, borderRadius: 5, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#7C8798', background: 'rgba(255,255,255,.04)', cursor: 'pointer', fontSize: 12 };
const addCardBtnStyle = { display: 'flex', alignItems: 'center', gap: 6, color: '#7C8798', fontSize: 13, padding: '9px 8px', borderRadius: 7, cursor: 'pointer', marginTop: 2 };
const addListStyle = { width: 272, flex: '0 0 272px', background: 'rgba(255,255,255,.02)', border: '1px solid #272E3A', borderRadius: 10, padding: '12px 14px', color: '#7C8798', fontSize: 13.5, cursor: 'pointer', height: 42, display: 'flex', alignItems: 'center' };
const overlayStyle = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: '5vh 16px' };
const modalStyle = { background: '#161B22', border: '1px solid #272E3A', width: '100%', maxWidth: 460, borderRadius: 12, padding: 22, boxShadow: '0 16px 48px rgba(0,0,0,.5)', maxHeight: '85vh', overflowY: 'auto' };
const modalCloseStyle = { background: 'none', border: 'none', fontSize: 16, color: '#7C8798', cursor: 'pointer', width: 28, height: 28, borderRadius: 6, flexShrink: 0 };
const fieldLabelStyle = { fontSize: 12, color: '#7C8798', marginBottom: 6, fontWeight: 600 };
const inputStyle = { width: '100%', background: '#1B212B', border: '1px solid #272E3A', color: '#E6E9EF', borderRadius: 7, padding: '8px 10px', fontSize: 13, marginBottom: 14, boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit' };
const toastStyle = { position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: '#161B22', border: '1px solid #272E3A', color: '#E6E9EF', padding: '10px 18px', borderRadius: 8, fontSize: 13, zIndex: 2000, maxWidth: 480, textAlign: 'center' };
