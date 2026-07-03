import HomeScreen from '../HomeScreen/HomeScreen';
import './ProfileFullScreen.css';

export default function ProfileFullScreen({ onClose }) {
  return (
    <div className="profile-fullscreen">
      <div className="profile-fullscreen-header">
        <span className="profile-fullscreen-title">👤 Profil</span>
        <button className="profile-fullscreen-close" onClick={onClose}>
          ✕
        </button>
      </div>
      <div className="profile-fullscreen-body">
        <HomeScreen />
      </div>
    </div>
  );
}
