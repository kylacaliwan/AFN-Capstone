import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import Layout from '../../components/layout/Layout';
import { fetchMessageParticipants, fetchMessages, sendMessage } from '../../api/api';
import { FiRefreshCw, FiSend, FiUsers } from 'react-icons/fi';

const STAFF_GROUP_ROOM = {
  key: 'group:staff',
  roomType: 'group',
  groupKey: 'staff',
  name: 'Staff Group Chat',
  subtitle: 'Admins, superadmins, and technicians',
  avatar: 'SG'
};

const roleLabel = (role) => {
  if (role === 'superadmin') return 'Superadmin';
  if (role === 'admin') return 'Admin';
  if (role === 'technician') return 'Technician';
  return 'Staff';
};

const initials = (name) =>
  String(name || 'Staff')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'S';

const formatTime = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
};

const getRoomKeyForMessage = (message, currentUserId) => {
  if (message.roomType === 'group') {
    return `group:${message.groupKey || 'staff'}`;
  }

  const partnerId = message.senderId === currentUserId ? message.receiverId : message.senderId;
  return `direct:${partnerId}`;
};

export default function TechnicianMessages() {
  const { user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [participants, setParticipants] = useState([]);
  const [selectedRoomKey, setSelectedRoomKey] = useState(STAFF_GROUP_ROOM.key);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const messagesEndRef = useRef(null);

  const rooms = useMemo(() => {
    const directRooms = participants.map((participant) => ({
      key: `direct:${participant.id}`,
      roomType: 'direct',
      participantId: participant.id,
      name: participant.name || participant.username || 'Staff',
      subtitle: roleLabel(participant.role),
      avatar: initials(participant.name || participant.username),
    }));

    const allRooms = [STAFF_GROUP_ROOM, ...directRooms];

    return allRooms.map((room) => {
      const roomMessages = messages.filter((message) => getRoomKeyForMessage(message, user?.id) === room.key);
      const latestMessage = [...roomMessages].sort(
        (first, second) => new Date(second.timestamp) - new Date(first.timestamp)
      )[0];

      return {
        ...room,
        lastMessage: latestMessage?.text || room.subtitle,
        timestamp: latestMessage?.timestamp || '',
        count: roomMessages.length,
      };
    }).sort((first, second) => {
      if (first.key === STAFF_GROUP_ROOM.key) return -1;
      if (second.key === STAFF_GROUP_ROOM.key) return 1;
      return new Date(second.timestamp || 0) - new Date(first.timestamp || 0);
    });
  }, [messages, participants, user?.id]);

  const activeRoom = rooms.find((room) => room.key === selectedRoomKey) || rooms[0] || STAFF_GROUP_ROOM;
  const selectedMessages = messages
    .filter((message) => getRoomKeyForMessage(message, user?.id) === activeRoom.key)
    .sort((first, second) => new Date(first.timestamp) - new Date(second.timestamp));

  const loadMessages = async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);

    try {
      const [messageList, participantList] = await Promise.all([
        fetchMessages('staff', user?.username),
        fetchMessageParticipants()
      ]);
      setMessages(messageList);
      setParticipants(participantList);
      setError('');
    } catch (loadError) {
      if (!silent) {
        setMessages([]);
        setParticipants([]);
        setError(loadError.message || 'Unable to load staff messages.');
      }
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    if (!user) return undefined;
    loadMessages();
    const interval = window.setInterval(() => loadMessages({ silent: true }), 10000);
    return () => window.clearInterval(interval);
  }, [user]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [selectedMessages.length, activeRoom.key]);

  const handleSend = async () => {
    if (!newMessage.trim() || !activeRoom) return;

    try {
      setSending(true);
      const sentMessage = await sendMessage({
        roomType: activeRoom.roomType,
        groupKey: activeRoom.groupKey,
        receiverId: activeRoom.participantId,
        text: newMessage,
      });
      setMessages((previousMessages) => [...previousMessages, sentMessage]);
      setNewMessage('');
      setError('');
      setStatusMessage(`Message sent to ${activeRoom.name}.`);
      window.setTimeout(() => setStatusMessage(''), 2500);
    } catch (sendError) {
      setError(sendError.message || 'Unable to send message.');
    } finally {
      setSending(false);
    }
  };

  return (
    <Layout>
      <div className="mx-auto max-w-7xl">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-2xl font-semibold text-slate-950">Messages</h2>
          <button
            type="button"
            onClick={() => loadMessages()}
            disabled={loading}
            className="grid h-10 w-10 place-items-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
            title="Refresh"
          >
            <FiRefreshCw size={17} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>

        {statusMessage && (
          <div className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            {statusMessage}
          </div>
        )}
        {error && (
          <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        )}

        <div className="grid min-h-[72vh] grid-cols-1 overflow-hidden rounded-[1.35rem] border border-slate-200 bg-white shadow-sm lg:h-[720px] lg:grid-cols-[360px_1fr]">
          <aside className="flex max-h-96 flex-col border-b border-slate-200 bg-white lg:max-h-none lg:border-b-0 lg:border-r">
            <div className="border-b border-slate-100 px-5 py-4">
              <div className="relative">
                <input
                  value=""
                  readOnly
                  placeholder="Search"
                  className="h-10 w-full rounded-full border-0 bg-slate-100 px-4 text-sm text-slate-500 outline-none"
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-2 py-2">
              {loading ? (
                <div className="p-4 text-sm text-slate-500">Loading messages...</div>
              ) : rooms.length === 0 ? (
                <div className="p-4 text-sm text-slate-500">No staff rooms available.</div>
              ) : (
                rooms.map((room) => (
                  <button
                    key={room.key}
                    type="button"
                    onClick={() => setSelectedRoomKey(room.key)}
                    className={`w-full rounded-2xl px-3 py-3 text-left transition ${
                      activeRoom?.key === room.key ? 'bg-sky-50' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex gap-3">
                      <div className={`grid h-12 w-12 flex-none place-items-center rounded-full text-sm font-bold text-white ${
                        room.roomType === 'group' ? 'bg-slate-900' : 'bg-gradient-to-br from-sky-500 to-blue-700'
                      }`}>
                        {room.roomType === 'group' ? <FiUsers size={19} /> : room.avatar}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <div className="truncate text-sm font-semibold text-slate-950">{room.name}</div>
                          {room.timestamp ? <div className="text-[11px] text-slate-400">{formatTime(room.timestamp)}</div> : null}
                        </div>
                        <div className="mt-0.5 truncate text-xs text-slate-500">{room.subtitle}</div>
                        <div className="mt-1 truncate text-sm text-slate-500">{room.lastMessage}</div>
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </aside>

          <section className="flex min-h-[36rem] flex-col bg-slate-50">
            <header className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-4">
              <div className="flex min-w-0 items-center gap-3">
                <div className={`grid h-11 w-11 flex-none place-items-center rounded-full text-sm font-bold text-white ${
                  activeRoom.roomType === 'group' ? 'bg-slate-900' : 'bg-gradient-to-br from-sky-500 to-blue-700'
                }`}>
                  {activeRoom.roomType === 'group' ? <FiUsers size={19} /> : activeRoom.avatar}
                </div>
                <div className="min-w-0">
                  <h3 className="truncate font-semibold text-slate-950">{activeRoom.name}</h3>
                  <p className="truncate text-xs text-slate-500">{activeRoom.subtitle}</p>
                </div>
              </div>
            </header>

            <div className="flex-1 space-y-2 overflow-y-auto px-4 py-5 sm:px-8">
              {selectedMessages.length === 0 ? (
                <div className="grid h-full place-items-center text-sm text-slate-500">
                  No messages here yet.
                </div>
              ) : (
                selectedMessages.map((message, index) => {
                  const sentByCurrentUser = message.senderId === user?.id;
                  const previousMessage = selectedMessages[index - 1];
                  const sameSender = previousMessage?.senderId === message.senderId;
                  return (
                    <div key={message.id} className={`flex ${sentByCurrentUser ? 'justify-end' : 'justify-start'} ${sameSender ? 'mt-1' : 'mt-4'}`}>
                      <div className={`flex max-w-[86%] items-end gap-2 sm:max-w-lg ${sentByCurrentUser ? 'flex-row-reverse' : ''}`}>
                        {!sentByCurrentUser && !sameSender ? (
                          <div className="grid h-8 w-8 flex-none place-items-center rounded-full bg-slate-700 text-xs font-bold text-white">
                            {initials(message.senderName)}
                          </div>
                        ) : (
                          !sentByCurrentUser && <div className="h-8 w-8 flex-none" />
                        )}
                        <div>
                          {!sentByCurrentUser && !sameSender && (
                            <div className="mb-1 ml-1 text-xs font-semibold text-slate-500">{message.senderName}</div>
                          )}
                          <div className={`rounded-[1.35rem] px-4 py-2.5 shadow-sm ${
                            sentByCurrentUser
                              ? 'rounded-br-md bg-sky-600 text-white'
                              : 'rounded-bl-md bg-white text-slate-950'
                          }`}>
                            <p className="whitespace-pre-wrap break-words text-sm leading-6">{message.text}</p>
                          </div>
                          <div className={`mt-1 text-[11px] ${sentByCurrentUser ? 'text-right text-slate-400' : 'ml-1 text-slate-400'}`}>
                            {formatTime(message.timestamp)}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            <div className="border-t border-slate-200 bg-white px-4 py-3 sm:px-5">
              <div className="flex items-end gap-2 rounded-3xl bg-slate-100 p-1.5">
                <textarea
                  value={newMessage}
                  onChange={(event) => setNewMessage(event.target.value)}
                  rows={1}
                  disabled={sending}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      handleSend();
                    }
                  }}
                  placeholder={`Message ${activeRoom.name}...`}
                  className="min-h-10 flex-1 resize-none border-0 bg-transparent px-4 py-2.5 text-sm outline-none placeholder:text-slate-400 disabled:text-slate-400"
                />
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={sending || !newMessage.trim()}
                  className="grid h-10 w-10 flex-none place-items-center rounded-full bg-sky-600 text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  <FiSend size={17} />
                </button>
              </div>
            </div>
          </section>
        </div>
      </div>
    </Layout>
  );
}
