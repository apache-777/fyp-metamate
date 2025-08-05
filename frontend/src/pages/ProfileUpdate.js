import React, { useState, useEffect } from 'react';
import { auth, db } from '../firebase';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { updatePassword, reauthenticateWithCredential, EmailAuthProvider } from 'firebase/auth';
import { useNavigate } from 'react-router-dom';

export default function ProfileUpdate() {
  const [username, setUsername] = useState('');
  const [bio, setBio] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [avatar, setAvatar] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    const fetchProfile = async () => {
      if (auth.currentUser) {
        const userDoc = await getDoc(doc(db, 'users', auth.currentUser.uid));
        if (userDoc.exists()) {
          setUsername(userDoc.data().username || '');
          setBio(userDoc.data().bio || '');
          setAvatar(userDoc.data().avatar || '');
        }
      }
    };
    fetchProfile();
  }, []);

  const handleProfileUpdate = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);
    try {
      if (auth.currentUser) {
        await updateDoc(doc(db, 'users', auth.currentUser.uid), { username, bio, avatar });
        setSuccess('Profile updated successfully!');
      }
    } catch (err) {
      setError('Failed to update profile.');
    }
    setLoading(false);
  };

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    if (newPassword !== confirmPassword) {
      setError('New passwords do not match.');
      return;
    }
    setLoading(true);
    try {
      const user = auth.currentUser;
      if (user && user.email) {
        const credential = EmailAuthProvider.credential(user.email, currentPassword);
        await reauthenticateWithCredential(user, credential);
        await updatePassword(user, newPassword);
        setSuccess('Password updated successfully!');
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      }
    } catch (err) {
      if (err.code === 'auth/weak-password') {
        setError('Password should be at least 6 characters');
      } else {
        setError(err.message || 'Failed to update password. Make sure your current password is correct.');
      }
    }
    setLoading(false);
  };

  const avatarOptions = [
    'https://i.ibb.co/Rtp5pmb/av1.jpg',
    'https://i.ibb.co/pj0MsbBg/av2.jpg',
    'https://i.ibb.co/vxTST5zr/av3.jpg',
    'https://i.ibb.co/d0Ygnkvp/av4.jpg',
    'https://i.ibb.co/F4FhmFQF/av5.jpg',
    'https://i.ibb.co/nNNRT9Dh/av6.jpg',
    'https://i.ibb.co/SDMZsmq8/av7.jpg',
    'https://i.ibb.co/bggQ6rmX/av8.jpg',
    'https://i.ibb.co/MDc91VMK/av9.jpg',
    'https://i.ibb.co/67ZCVMfw/av10.jpg',
    'https://i.ibb.co/HpFQBhLz/av11.jpg',
    'https://i.ibb.co/JFj0426W/av12.jpg',
    'https://i.ibb.co/7NZj97kF/av13.jpg',
  ];

  return (
    <div className="profile-update-container">
      <h2>Update Profile</h2>
      <form onSubmit={handleProfileUpdate} className="profile-form">
        <label>Username</label>
        <input type="text" value={username} onChange={e => setUsername(e.target.value)} required />
        <label>Bio</label>
        <textarea value={bio} onChange={e => setBio(e.target.value)} placeholder="Tell us about yourself..." />
        <label>Choose Avatar</label>
        <div className="avatar-grid">
          {avatarOptions.map((url, idx) => (
            <img
              key={idx}
              src={url}
              alt={`avatar-${idx}`}
              className={`avatar-option${avatar === url ? ' selected' : ''}`}
              onClick={() => setAvatar(url)}
            />
          ))}
        </div>
        <button type="submit" disabled={loading}>Update Profile</button>
      </form>
      <form onSubmit={handlePasswordChange} className="profile-form">
        <label>Change Password</label>
        <input type="password" placeholder="Current Password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} required />
        <input type="password" placeholder="New Password" value={newPassword} onChange={e => setNewPassword(e.target.value)} required />
        <input type="password" placeholder="Confirm New Password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required />
        <button type="submit" disabled={loading}>Update Password</button>
      </form>
      {error && <div className="error">{error}</div>}
      {success && <div className="success">{success}</div>}
      <button className="back-btn" onClick={() => navigate('/dashboard')}>Back to Dashboard</button>
    </div>
  );
} 