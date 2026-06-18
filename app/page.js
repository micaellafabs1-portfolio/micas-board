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
  Urgent: { bg: 'rgba(255,92,92,.14)', text: '#FF5C5C' },
  High: { bg: 'rgba(255,166,77,.14)', text: '#FFA64D' },
  Medium: { bg: 'rgba(242,217,59,.14)', text: '#D4BC1E' },
  Supplier: { bg: 'rgba(59,158,255,.14)', text: '#3B9EFF' },
  Response: { bg: 'rgba(185,140,242,.14)', text: '#B98CF2' },
  Done: { bg: 'rgba(74,222,128,.14)', text: '#4ADE80' },
};

const AVATAR_COLORS = ['#5C2D91', '#B04632', '#216E4E', '#974F0C', '#943EBC'];

function getInitials(name) {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function BoardPage() {
  const [lists, setLists] = useState([]);
  const [cards, setCards] = useState([]);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  const [editingCard, setEditingCard] = useState(null); // full card object being edited (draft)
  const [showShare, setShowShare] = useState(false);
  const [inviteVal, setInviteVal] = useState('');
  const [toast, setToast] = useState('');
  const [copyState, setCopyState] = useState(null); // { card, targetListId, targetPosition }

  const dragCardRef = useRef(null); // { cardId, fromListId }
  const [dragOverInfo, setDragOverInfo] = useState(null); // { listId, index }

  // ---------- Initial load ----------
  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    setLoading(true);
    setErrorMsg('');
    try {
      const [listsRes, cardsRes, membersRes] = await Promise.all([
        supabase.from('lists').select('*').order('position', { ascending: true }),
        supabase.from('cards').select('*').order('position', { ascending: true }),
        supabase.from('members').select('*').order('created_at', { ascending: true }),
      ]);
      if (listsRes.error) throw listsRes.error;
      if (cardsRes.error) throw cardsRes.error;
      if (membersRes.error) throw membersRes.error;
      setLists(listsRes.data || []);
      setCards(cardsRes.data || []);
      setMembers(membersRes.data || []);
    } catch (e) {
      console.error(e);
      setErrorMsg(
        'Could not load the board. Check that NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are set correctly, and that the schema/seed SQL has been run in Supabase.'
      );
    }
    setLoading(false);
  }

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2200);
  };

  // ---------- Cards by list ----------
  const cardsForList = useCallback(
    (listId) => cards.filter((c) => c.list_id === listId).sort((a, b) => a.position - b.position),
    [cards]
  );

  // ---------- Drag & drop with precise positioning ----------
  // We use fractional positions so a card can be dropped between any two
  // existing cards without needing to re-write every other row.
  function computeNewPosition(listId, targetIndex) {
    const listCards = cardsForList(listId);
    if (listCards.length === 0) return 1;
    if (targetIndex <= 0) return listCards[0].position - 1;
    if (targetIndex >= listCards.length) return listCards[listCards.length - 1].position + 1;
    const before = listCards[targetIndex - 1].position;
    const after = listCards[targetIndex].position;
    return (before + after) / 2;
  }

  function handleDragStart(cardId, fromListId) {
    dragCardRef.current = { cardId, fromListId };
  }

  function handleDragOverCard(e, listId, index) {
    e.preventDefault();
    setDragOverInfo({ listId, index });
  }

  function handleDragOverListEnd(e, listId) {
    e.preventDefault();
    const count = cardsForList(listId).length;
    setDragOverInfo({ listId, index: count });
  }

  async function handleDrop() {
    const dragInfo = dragCardRef.current;
    const dropInfo = dragOverInfo;
    dragCardRef.current = null;
    setDragOverInfo(null);
    if (!dragInfo || !dropInfo) return;

    const { cardId, fromListId } = dragInfo;
    const { listId: toListId, index } = dropInfo;

    // Adjust target index if dropping within the same list, after removing the dragged card from consideration
    let adjustedIndex = index;
    if (fromListId === toListId) {
      const listCards = cardsForList(toListId);
      const draggedIdx = listCards.findIndex((c) => c.id === cardId);
      if (draggedIdx !== -1 && draggedIdx < index) {
        adjustedIndex = index - 1;
      }
    }

    const newPosition = computeNewPosition(toListId, adjustedIndex);

    // Optimistic update
    setCards((prev) =>
      prev.map((c) => (c.id === cardId ? { ...c, list_id: toListId, position: newPosition } : c))
    );

    const { error } = await supabase
      .from('cards')
      .update({ list_id: toListId, position: newPosition, updated_at: new Date().toISOString() })
      .eq('id', cardId);

    if (error) {
      console.error(error);
      showToast('Failed to save move — reloading');
      loadAll();
    } else {
      showToast('Card moved');
    }
  }

  // ---------- Add card ----------
  async function addCard(listId) {
    const listCards = cardsForList(listId);
    const newPosition = listCards.length ? listCards[listCards.length - 1].position + 1 : 1;
    const { data, error } = await supabase
      .from('cards')
      .insert({ list_id: listId, title: 'New card', label: 'None', position: newPosition })
      .select()
      .single();
    if (error) {
      console.error(error);
      showToast('Failed to add card');
      return;
    }
    setCards((prev) => [...prev, data]);
    setEditingCard({ ...data });
  }

  // ---------- Edit card modal ----------
  function openCardModal(card) {
    setEditingCard({ ...card });
  }

  function closeCardModal() {
    setEditingCard(null);
  }

  async function saveEditingCard() {
    if (!editingCard) return;
    const { id, title, label, due_date, description } = editingCard;
    const { error } = await supabase
      .from('cards')
      .update({
        title: title?.trim() || 'Untitled',
        label,
        due_date: due_date || null,
        description: description || '',
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (error) {
      console.error(error);
      showToast('Save failed');
      return;
    }

    setCards((prev) =>
      prev.map((c) =>
        c.id === id
          ? { ...c, title: title?.trim() || 'Untitled', label, due_date: due_date || null, description: description || '' }
          : c
      )
    );
    showToast('Saved');
    setEditingCard(null);
  }

  async function deleteCard(cardId) {
    if (!confirm('Delete this card?')) return;
    const { error } = await supabase.from('cards').delete().eq('id', cardId);
    if (error) {
      console.error(error);
      showToast('Delete failed');
      return;
    }
    setCards((prev) => prev.filter((c) => c.id !== cardId));
    setEditingCard(null);
    showToast('Card deleted');
  }

  // ---------- Copy card ----------
  function openCopyModal(card) {
    const currentList = card.list_id;
    const listCardsCount = cardsForList(currentList).length;
    setCopyState({
      card,
      title: card.title,
      targetListId: currentList,
      targetPosition: listCardsCount, // default to end
    });
  }

  async function confirmCopyCard() {
    if (!copyState) return;
    const { card, title, targetListId, targetPosition } = copyState;
    const newPosition = computeNewPosition(targetListId, targetPosition);

    const { data, error } = await supabase
      .from('cards')
      .insert({
        list_id: targetListId,
        title: title?.trim() || card.title,
        label: card.label,
        due_date: card.due_date,
        description: card.description,
        position: newPosition,
      })
      .select()
      .single();

    if (error) {
      console.error(error);
      showToast('Copy failed');
      return;
    }
    setCards((prev) => [...prev, data]);
    setCopyState(null);
    showToast('Card copied');
  }

  // ---------- Add list ----------
  async function addList() {
    const name = prompt('New list name:');
    if (!name || !name.trim()) return;
    const newPosition = lists.length ? lists[lists.length - 1].position + 1 : 0;
    const { data, error } = await supabase
      .from('lists')
      .insert({ title: name.trim(), emoji: '📌', type: 'normal', position: newPosition })
      .select()
      .single();
    if (error) {
      console.error(error);
      showToast('Failed to add list');
      return;
    }
    setLists((prev) => [...prev, data]);
  }

  async function deleteList(listId) {
    if (!confirm('Delete this list and all its cards?')) return;
    const { error } = await supabase.from('lists').delete().eq('id', listId);
    if (error) {
      console.error(error);
      showToast('Failed to delete list');
      return;
    }
    setLists((prev) => prev.filter((l) => l.id !== listId));
    setCards((prev) => prev.filter((c) => c.list_id !== listId));
  }

  // ---------- Members / Share ----------
  async function handleInvite() {
    const val = inviteVal.trim();
    if (!val) return;
    let name = val;
    if (val.includes('@')) name = val.split('@')[0].replace(/[._]/g, ' ');
    name = name.replace(/\b\w/g, (c) => c.toUpperCase());

    if (members.some((m) => m.name.toLowerCase() === name.toLowerCase())) {
      showToast(`${name} is already on this board`);
      setInviteVal('');
      return;
    }

    const color = AVATAR_COLORS[members.length % AVATAR_COLORS.length];
    const { data, error } = await supabase
      .from('members')
      .insert({ name, initials: getInitials(name), color, role: 'Member' })
      .select()
      .single();

    if (error) {
      console.error(error);
      showToast('Failed to add member');
      return;
    }
    setMembers((prev) => [...prev, data]);
    setInviteVal('');
    showToast(
      `${name} added to the board. Note: this only adds them visually — to actually notify them, send the page link yourself for now.`
    );
  }

  // ---------- Render ----------
  if (loading) {
    return (
      <div style={shellStyle}>
        <div style={{ color: '#7C8798', padding: 24, fontFamily: 'sans-serif' }}>Loading board…</div>
      </div>
    );
  }

  if (errorMsg) {
    return (
      <div style={shellStyle}>
        <div style={{ color: '#FF5C5C', padding: 24, fontFamily: 'sans-serif', maxWidth: 600, lineHeight: 1.6 }}>
          {errorMsg}
        </div>
      </div>
    );
  }

  return (
    <div style={shellStyle}>
      <div style={sidebarStyle}>
        <div style={logoMarkStyle}>M</div>
        <div style={{ ...sideIconStyle, background: 'rgba(59,158,255,.15)', color: '#3B9EFF' }}>▦</div>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <div style={topbarStyle}>
          <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-0.2px' }}>Mica's Board</div>
          <div style={liveTagStyle}>
            <span style={liveDotStyle} />
            Live
          </div>
          <div style={{ flex: 1 }} />
          <div style={{ display: 'flex', alignItems: 'center' }}>
            {members.map((m, i) => (
              <div
                key={m.id}
                title={m.name}
                style={{ ...avatarStyle, background: m.color, marginLeft: i === 0 ? 0 : -8 }}
              >
                {m.initials}
              </div>
            ))}
          </div>
          <div
            onClick={() => setShowShare(true)}
            style={{ ...addMemberBtnStyle, marginLeft: members.length ? -8 : 0 }}
            title="Invite member"
          >
            +
          </div>
          <button onClick={() => setShowShare(true)} style={topBtnStyle}>
            Share
          </button>
        </div>

        <div style={boardCanvasStyle}>
          {lists.map((list) => {
            const listCards = cardsForList(list.id);
            const isTemplates = list.type === 'templates';
            return (
              <div
                key={list.id}
                style={{
                  ...listStyle,
                  background: isTemplates ? 'linear-gradient(180deg, rgba(74,222,128,.05), #161B22 40%)' : '#161B22',
                  borderColor:
                    dragOverInfo?.listId === list.id ? '#3B9EFF' : isTemplates ? 'rgba(74,222,128,.25)' : '#272E3A',
                }}
                onDragOver={(e) => {
                  // default: hovering empty space at end of list
                  if (listCards.length === 0) handleDragOverListEnd(e, list.id);
                }}
                onDrop={handleDrop}
              >
                <div style={listHeaderStyle}>
                  <span>{list.emoji}</span>
                  <span style={{ flex: 1 }}>{list.title}</span>
                  <span style={countStyle}>{listCards.length}</span>
                  <span
                    style={{ color: '#4D5566', cursor: 'pointer', fontSize: 13, padding: '2px 4px' }}
                    onClick={() => deleteList(list.id)}
                    title="Delete list"
                  >
                    ✕
                  </span>
                </div>

                <div style={cardsContainerStyle}>
                  {listCards.map((card, idx) => {
                    const isUrgent = card.label === 'Urgent';
                    const labelStyle = LABEL_STYLES[card.label];
                    const showDropLineAbove = dragOverInfo?.listId === list.id && dragOverInfo?.index === idx;
                    return (
                      <div key={card.id}>
                        {showDropLineAbove && <div style={dropLineStyle} />}
                        <div
                          draggable
                          onDragStart={() => handleDragStart(card.id, list.id)}
                          onDragOver={(e) => handleDragOverCard(e, list.id, idx)}
                          onDrop={handleDrop}
                          onClick={() => openCardModal(card)}
                          style={{
                            ...cardStyle,
                            borderLeft: isUrgent ? '2px solid #FF5C5C' : isTemplates ? '2px solid #4ADE80' : cardStyle.borderLeft,
                          }}
                        >
                          {card.label !== 'None' && (
                            <span
                              style={{
                                ...labelPillStyle,
                                background: labelStyle.bg,
                                color: labelStyle.text,
                              }}
                            >
                              {LABEL_OPTIONS.find((o) => o.value === card.label)?.text}
                            </span>
                          )}
                          <div style={cardTitleStyle}>
                            {isTemplates && <DocIcon />}
                            {card.title}
                          </div>
                          {card.due_date && (
                            <div style={cardMetaStyle}>
                              <ClockIcon />
                              {formatDate(card.due_date)}
                            </div>
                          )}
                          <div
                            onClick={(e) => {
                              e.stopPropagation();
                              openCopyModal(card);
                            }}
                            style={copyBtnStyle}
                            title="Copy card"
                          >
                            ⧉
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {dragOverInfo?.listId === list.id && dragOverInfo?.index === listCards.length && (
                    <div style={dropLineStyle} />
                  )}
                  <div
                    style={{ minHeight: 8 }}
                    onDragOver={(e) => handleDragOverListEnd(e, list.id)}
                    onDrop={handleDrop}
                  />
                </div>

                <div onClick={() => addCard(list.id)} style={addCardBtnStyle}>
                  + Add a card
                </div>
              </div>
            );
          })}
          <div onClick={addList} style={addListStyle}>
            + Add another list
          </div>
        </div>
      </div>

      {/* ---------- Card edit modal ---------- */}
      {editingCard && (
        <div style={overlayStyle} onClick={(e) => e.target === e.currentTarget && closeCardModal()}>
          <div style={modalStyle}>
            <div style={modalTitleRowStyle}>
              <input
                value={editingCard.title}
                onChange={(e) => setEditingCard({ ...editingCard, title: e.target.value })}
                style={modalTitleInputStyle}
              />
              <button onClick={closeCardModal} style={modalCloseStyle}>
                ✕
              </button>
            </div>

            <div style={fieldLabelStyle}>Label</div>
            <select
              value={editingCard.label}
              onChange={(e) => setEditingCard({ ...editingCard, label: e.target.value })}
              style={inputStyle}
            >
              {LABEL_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.text}
                </option>
              ))}
            </select>

            <div style={fieldLabelStyle}>Due date</div>
            <input
              type="date"
              value={editingCard.due_date || ''}
              onChange={(e) => setEditingCard({ ...editingCard, due_date: e.target.value })}
              style={inputStyle}
            />

            <div style={fieldLabelStyle}>Description</div>
            <textarea
              value={editingCard.description || ''}
              onChange={(e) => setEditingCard({ ...editingCard, description: e.target.value })}
              rows={7}
              style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.7, fontFamily: 'inherit' }}
            />

            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={saveEditingCard} style={{ ...topBtnStyle, flex: 1, justifyContent: 'center' }}>
                Save
              </button>
              <button
                onClick={() => deleteCard(editingCard.id)}
                style={{
                  background: '#1B212B',
                  border: '1px solid rgba(255,92,92,.3)',
                  color: '#FF5C5C',
                  borderRadius: 7,
                  padding: '9px 14px',
                  fontSize: 13,
                  cursor: 'pointer',
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---------- Copy card modal ---------- */}
      {copyState && (
        <div style={overlayStyle} onClick={(e) => e.target === e.currentTarget && setCopyState(null)}>
          <div style={modalStyle}>
            <div style={{ fontSize: 17, fontWeight: 600, marginBottom: 4 }}>Copy card</div>
            <div style={{ fontSize: 13, color: '#7C8798', marginBottom: 16 }}>
              Copying "{copyState.card.title}"
            </div>
            <div style={fieldLabelStyle}>Name</div>
            <input
              value={copyState.title}
              onChange={(e) => setCopyState({ ...copyState, title: e.target.value })}
              style={inputStyle}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ flex: 1 }}>
                <div style={fieldLabelStyle}>List</div>
                <select
                  value={copyState.targetListId}
                  onChange={(e) => {
                    const newListId = e.target.value;
                    setCopyState({ ...copyState, targetListId: newListId, targetPosition: cardsForList(newListId).length });
                  }}
                  style={inputStyle}
                >
                  {lists.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.emoji} {l.title}
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <div style={fieldLabelStyle}>Position</div>
                <select
                  value={copyState.targetPosition}
                  onChange={(e) => setCopyState({ ...copyState, targetPosition: parseInt(e.target.value, 10) })}
                  style={inputStyle}
                >
                  {Array.from({ length: cardsForList(copyState.targetListId).length + 1 }).map((_, i) => (
                    <option key={i} value={i}>
                      {i + 1}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <button onClick={confirmCopyCard} style={{ ...topBtnStyle, width: '100%', justifyContent: 'center', marginTop: 4 }}>
              Create card
            </button>
          </div>
        </div>
      )}

      {/* ---------- Share modal ---------- */}
      {showShare && (
        <div style={overlayStyle} onClick={(e) => e.target === e.currentTarget && setShowShare(false)}>
          <div style={modalStyle}>
            <div style={{ fontSize: 17, fontWeight: 600, marginBottom: 4 }}>Share board</div>
            <div style={{ fontSize: 13, color: '#7C8798', marginBottom: 16 }}>
              Send your boss this page's URL directly — anyone with the link can view and edit this board.
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              <input
                value={inviteVal}
                onChange={(e) => setInviteVal(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleInvite()}
                placeholder="Name or email (adds them to the member list)"
                style={{ ...inputStyle, marginBottom: 0, flex: 1 }}
              />
              <button onClick={handleInvite} style={topBtnStyle}>
                Add
              </button>
            </div>
            <div style={{ fontSize: 12.5, color: '#7C8798', marginBottom: 10 }}>Members on this board</div>
            {members.map((m) => (
              <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', fontSize: 13.5 }}>
                <div style={{ ...avatarStyle, width: 26, height: 26, fontSize: 10.5, background: m.color }}>
                  {m.initials}
                </div>
                <div style={{ flex: 1 }}>{m.name}</div>
                <div style={{ fontSize: 11.5, color: '#7C8798' }}>{m.role}</div>
              </div>
            ))}
            <button
              onClick={() => setShowShare(false)}
              style={{
                marginTop: 14,
                width: '100%',
                background: '#1B212B',
                border: '1px solid #272E3A',
                color: '#E6E9EF',
                borderRadius: 7,
                padding: 9,
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              Close
            </button>
          </div>
        </div>
      )}

      {toast && <div style={toastStyle}>{toast}</div>}
    </div>
  );
}

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 4 }}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 3" />
    </svg>
  );
}

function DocIcon() {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="#7C8798" strokeWidth="2" style={{ marginRight: 6, flexShrink: 0, marginTop: 1 }}>
      <path d="M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9z" />
      <path d="M14 3v6h6" />
    </svg>
  );
}

// ---------------- inline styles ----------------
const shellStyle = {
  display: 'flex',
  height: '100vh',
  fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif',
  background: '#0E1116',
  color: '#E6E9EF',
  overflow: 'hidden',
};
const sidebarStyle = {
  width: 56,
  flex: '0 0 56px',
  background: '#161B22',
  borderRight: '1px solid #272E3A',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  padding: '16px 0',
  gap: 8,
};
const logoMarkStyle = {
  width: 30,
  height: 30,
  borderRadius: 7,
  background: 'linear-gradient(135deg,#3B9EFF,#7C5CFF)',
  marginBottom: 18,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontWeight: 800,
  fontSize: 13,
  color: '#fff',
};
const sideIconStyle = {
  width: 36,
  height: 36,
  borderRadius: 8,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  fontSize: 16,
};
const topbarStyle = {
  height: 60,
  flex: '0 0 60px',
  display: 'flex',
  alignItems: 'center',
  padding: '0 22px',
  gap: 14,
  borderBottom: '1px solid #272E3A',
};
const liveTagStyle = {
  fontSize: 11,
  color: '#7C8798',
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  background: '#1B212B',
  border: '1px solid #272E3A',
  borderRadius: 20,
  padding: '4px 10px 4px 8px',
};
const liveDotStyle = {
  width: 7,
  height: 7,
  borderRadius: '50%',
  background: '#4ADE80',
  boxShadow: '0 0 0 3px rgba(74,222,128,.18)',
};
const avatarStyle = {
  width: 30,
  height: 30,
  borderRadius: '50%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 11,
  fontWeight: 700,
  color: '#fff',
  border: '2px solid #0E1116',
  flexShrink: 0,
};
const addMemberBtnStyle = {
  width: 30,
  height: 30,
  borderRadius: '50%',
  background: '#1B212B',
  border: '1.5px dashed #4D5566',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: '#7C8798',
  cursor: 'pointer',
  fontSize: 15,
};
const topBtnStyle = {
  background: '#3B9EFF',
  color: '#fff',
  border: 'none',
  borderRadius: 7,
  padding: '8px 14px',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  gap: 6,
};
const boardCanvasStyle = {
  flex: 1,
  overflowX: 'auto',
  overflowY: 'hidden',
  padding: 20,
  display: 'flex',
  alignItems: 'flex-start',
  gap: 14,
};
const listStyle = {
  width: 272,
  flex: '0 0 272px',
  border: '1px solid #272E3A',
  borderRadius: 10,
  maxHeight: '100%',
  display: 'flex',
  flexDirection: 'column',
  padding: '12px 10px 10px 10px',
  transition: 'border-color .15s',
};
const listHeaderStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 7,
  padding: '2px 6px 12px 6px',
  fontSize: 13.5,
  fontWeight: 600,
};
const countStyle = {
  color: '#7C8798',
  fontWeight: 500,
  fontSize: 11.5,
  background: 'rgba(255,255,255,.04)',
  borderRadius: 10,
  padding: '1px 7px',
};
const cardsContainerStyle = {
  overflowY: 'auto',
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  paddingBottom: 4,
  minHeight: 24,
};
const cardStyle = {
  background: '#1B212B',
  border: '1px solid #272E3A',
  borderRadius: 9,
  padding: '11px 30px 12px 12px',
  cursor: 'grab',
  position: 'relative',
};
const dropLineStyle = {
  height: 3,
  background: '#3B9EFF',
  borderRadius: 2,
  margin: '0 2px 8px 2px',
};
const labelPillStyle = {
  display: 'inline-block',
  fontSize: 10.5,
  fontWeight: 700,
  borderRadius: 5,
  padding: '3px 8px',
  marginBottom: 8,
  letterSpacing: '.2px',
};
const cardTitleStyle = {
  fontSize: 13.5,
  color: '#E6E9EF',
  lineHeight: 1.4,
  marginBottom: 6,
  fontWeight: 500,
  display: 'flex',
  alignItems: 'flex-start',
};
const cardMetaStyle = {
  display: 'flex',
  alignItems: 'center',
  fontSize: 11.5,
  color: '#7C8798',
};
const copyBtnStyle = {
  position: 'absolute',
  top: 8,
  right: 8,
  width: 20,
  height: 20,
  borderRadius: 5,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: '#7C8798',
  background: 'rgba(255,255,255,.04)',
  cursor: 'pointer',
  fontSize: 12,
};
const addCardBtnStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  color: '#7C8798',
  fontSize: 13,
  padding: '9px 8px',
  borderRadius: 7,
  cursor: 'pointer',
  marginTop: 2,
};
const addListStyle = {
  width: 272,
  flex: '0 0 272px',
  background: 'rgba(255,255,255,.02)',
  border: '1px solid #272E3A',
  borderRadius: 10,
  padding: '12px 14px',
  color: '#7C8798',
  fontSize: 13.5,
  cursor: 'pointer',
  height: 42,
  display: 'flex',
  alignItems: 'center',
};
const overlayStyle = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,.65)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 200,
  padding: '5vh 16px',
};
const modalStyle = {
  background: '#161B22',
  border: '1px solid #272E3A',
  width: '100%',
  maxWidth: 460,
  borderRadius: 12,
  padding: 22,
  boxShadow: '0 16px 48px rgba(0,0,0,.5)',
  maxHeight: '85vh',
  overflowY: 'auto',
};
const modalTitleRowStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  marginBottom: 16,
  gap: 10,
};
const modalTitleInputStyle = {
  background: 'transparent',
  border: 'none',
  color: '#E6E9EF',
  fontSize: 16,
  fontWeight: 600,
  width: '100%',
  outline: 'none',
};
const modalCloseStyle = {
  background: 'none',
  border: 'none',
  fontSize: 16,
  color: '#7C8798',
  cursor: 'pointer',
  width: 28,
  height: 28,
  borderRadius: 6,
  flexShrink: 0,
};
const fieldLabelStyle = {
  fontSize: 12,
  color: '#7C8798',
  marginBottom: 6,
  fontWeight: 600,
};
const inputStyle = {
  width: '100%',
  background: '#1B212B',
  border: '1px solid #272E3A',
  color: '#E6E9EF',
  borderRadius: 7,
  padding: '8px 10px',
  fontSize: 13,
  marginBottom: 14,
  boxSizing: 'border-box',
  outline: 'none',
};
const toastStyle = {
  position: 'fixed',
  bottom: 24,
  left: '50%',
  transform: 'translateX(-50%)',
  background: '#161B22',
  border: '1px solid #272E3A',
  color: '#E6E9EF',
  padding: '10px 18px',
  borderRadius: 8,
  fontSize: 13,
  zIndex: 2000,
  maxWidth: 480,
  textAlign: 'center',
};
