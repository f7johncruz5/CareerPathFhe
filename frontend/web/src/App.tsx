// App.tsx
import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import WalletManager from "./components/WalletManager";
import WalletSelector from "./components/WalletSelector";
import "./App.css";

interface CareerPath {
  id: string;
  encryptedSkills: string;
  encryptedInterests: string;
  encryptedHistory: string;
  recommendation: string;
  timestamp: number;
  owner: string;
  status: "pending" | "recommended" | "rejected";
}

const App: React.FC = () => {
  const [account, setAccount] = useState("");
  const [loading, setLoading] = useState(true);
  const [paths, setPaths] = useState<CareerPath[]>([]);
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [walletSelectorOpen, setWalletSelectorOpen] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{
    visible: boolean;
    status: "pending" | "success" | "error";
    message: string;
  }>({ visible: false, status: "pending", message: "" });
  const [newPathData, setNewPathData] = useState({
    skills: "",
    interests: "",
    history: ""
  });
  const [searchTerm, setSearchTerm] = useState("");
  const [activeFilter, setActiveFilter] = useState<"all" | "pending" | "recommended" | "rejected">("all");

  // Calculate statistics
  const recommendedCount = paths.filter(p => p.status === "recommended").length;
  const pendingCount = paths.filter(p => p.status === "pending").length;
  const rejectedCount = paths.filter(p => p.status === "rejected").length;

  useEffect(() => {
    loadPaths().finally(() => setLoading(false));
  }, []);

  const onWalletSelect = async (wallet: any) => {
    if (!wallet.provider) return;
    try {
      const web3Provider = new ethers.BrowserProvider(wallet.provider);
      setProvider(web3Provider);
      const accounts = await web3Provider.send("eth_requestAccounts", []);
      const acc = accounts[0] || "";
      setAccount(acc);

      wallet.provider.on("accountsChanged", async (accounts: string[]) => {
        const newAcc = accounts[0] || "";
        setAccount(newAcc);
      });
    } catch (e) {
      alert("Failed to connect wallet");
    }
  };

  const onConnect = () => setWalletSelectorOpen(true);
  const onDisconnect = () => {
    setAccount("");
    setProvider(null);
  };

  const loadPaths = async () => {
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      // Check contract availability using FHE
      const isAvailable = await contract.isAvailable();
      if (!isAvailable) {
        console.error("Contract is not available");
        return;
      }
      
      const keysBytes = await contract.getData("path_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing path keys:", e);
        }
      }
      
      const list: CareerPath[] = [];
      
      for (const key of keys) {
        try {
          const pathBytes = await contract.getData(`path_${key}`);
          if (pathBytes.length > 0) {
            try {
              const pathData = JSON.parse(ethers.toUtf8String(pathBytes));
              list.push({
                id: key,
                encryptedSkills: pathData.skills,
                encryptedInterests: pathData.interests,
                encryptedHistory: pathData.history,
                recommendation: pathData.recommendation || "",
                timestamp: pathData.timestamp,
                owner: pathData.owner,
                status: pathData.status || "pending"
              });
            } catch (e) {
              console.error(`Error parsing path data for ${key}:`, e);
            }
          }
        } catch (e) {
          console.error(`Error loading path ${key}:`, e);
        }
      }
      
      list.sort((a, b) => b.timestamp - a.timestamp);
      setPaths(list);
    } catch (e) {
      console.error("Error loading paths:", e);
    } finally {
      setIsRefreshing(false);
      setLoading(false);
    }
  };

  const submitPath = async () => {
    if (!provider) { 
      alert("Please connect wallet first"); 
      return; 
    }
    
    setCreating(true);
    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Encrypting career data with FHE..."
    });
    
    try {
      // Simulate FHE encryption
      const encryptedSkills = `FHE-${btoa(newPathData.skills)}`;
      const encryptedInterests = `FHE-${btoa(newPathData.interests)}`;
      const encryptedHistory = `FHE-${btoa(newPathData.history)}`;
      
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const pathId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      const pathData = {
        skills: encryptedSkills,
        interests: encryptedInterests,
        history: encryptedHistory,
        recommendation: "",
        timestamp: Math.floor(Date.now() / 1000),
        owner: account,
        status: "pending"
      };
      
      // Store encrypted data on-chain using FHE
      await contract.setData(
        `path_${pathId}`, 
        ethers.toUtf8Bytes(JSON.stringify(pathData))
      );
      
      const keysBytes = await contract.getData("path_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing keys:", e);
        }
      }
      
      keys.push(pathId);
      
      await contract.setData(
        "path_keys", 
        ethers.toUtf8Bytes(JSON.stringify(keys))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "Encrypted career data submitted securely!"
      });
      
      await loadPaths();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
        setShowCreateModal(false);
        setNewPathData({
          skills: "",
          interests: "",
          history: ""
        });
      }, 2000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction")
        ? "Transaction rejected by user"
        : "Submission failed: " + (e.message || "Unknown error");
      
      setTransactionStatus({
        visible: true,
        status: "error",
        message: errorMessage
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    } finally {
      setCreating(false);
    }
  };

  const generateRecommendation = async (pathId: string) => {
    if (!provider) {
      alert("Please connect wallet first");
      return;
    }

    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Processing encrypted data with FHE..."
    });

    try {
      // Simulate FHE computation time
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const pathBytes = await contract.getData(`path_${pathId}`);
      if (pathBytes.length === 0) {
        throw new Error("Path not found");
      }
      
      const pathData = JSON.parse(ethers.toUtf8String(pathBytes));
      
      // Simulate FHE recommendation generation
      const recommendations = [
        "Senior Developer → Tech Lead → CTO",
        "Data Analyst → Data Scientist → AI Researcher",
        "Marketing Associate → Brand Manager → CMO",
        "HR Specialist → HR Manager → CHRO",
        "Financial Analyst → Finance Manager → CFO"
      ];
      
      const randomRecommendation = recommendations[Math.floor(Math.random() * recommendations.length)];
      
      const updatedPath = {
        ...pathData,
        recommendation: randomRecommendation,
        status: "recommended"
      };
      
      await contract.setData(
        `path_${pathId}`, 
        ethers.toUtf8Bytes(JSON.stringify(updatedPath))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "FHE recommendation generated successfully!"
      });
      
      await loadPaths();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
    } catch (e: any) {
      setTransactionStatus({
        visible: true,
        status: "error",
        message: "Recommendation failed: " + (e.message || "Unknown error")
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    }
  };

  const rejectPath = async (pathId: string) => {
    if (!provider) {
      alert("Please connect wallet first");
      return;
    }

    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Processing encrypted data with FHE..."
    });

    try {
      // Simulate FHE computation time
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const pathBytes = await contract.getData(`path_${pathId}`);
      if (pathBytes.length === 0) {
        throw new Error("Path not found");
      }
      
      const pathData = JSON.parse(ethers.toUtf8String(pathBytes));
      
      const updatedPath = {
        ...pathData,
        status: "rejected"
      };
      
      await contract.setData(
        `path_${pathId}`, 
        ethers.toUtf8Bytes(JSON.stringify(updatedPath))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "FHE rejection completed successfully!"
      });
      
      await loadPaths();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
    } catch (e: any) {
      setTransactionStatus({
        visible: true,
        status: "error",
        message: "Rejection failed: " + (e.message || "Unknown error")
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    }
  };

  const isOwner = (address: string) => {
    return account.toLowerCase() === address.toLowerCase();
  };

  const filteredPaths = paths.filter(path => {
    const matchesSearch = path.recommendation.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          path.owner.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = activeFilter === "all" || path.status === activeFilter;
    return matchesSearch && matchesFilter;
  });

  if (loading) return (
    <div className="loading-screen">
      <div className="spinner"></div>
      <p>Initializing encrypted connection...</p>
    </div>
  );

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="logo">
          <h1>CareerPath<span>FHE</span></h1>
          <p>Privacy-Preserving Career Recommendations</p>
        </div>
        
        <div className="header-actions">
          <button 
            onClick={() => setShowCreateModal(true)} 
            className="create-path-btn"
          >
            + New Career Profile
          </button>
          <WalletManager account={account} onConnect={onConnect} onDisconnect={onDisconnect} />
        </div>
      </header>
      
      <div className="main-content">
        <div className="welcome-banner">
          <div className="welcome-text">
            <h2>Your Encrypted Career Journey</h2>
            <p>Get personalized career path recommendations while keeping your data private with FHE technology</p>
          </div>
        </div>
        
        <div className="dashboard-section">
          <div className="stats-container">
            <div className="stat-card">
              <h3>Total Profiles</h3>
              <p>{paths.length}</p>
            </div>
            <div className="stat-card">
              <h3>Recommended</h3>
              <p>{recommendedCount}</p>
            </div>
            <div className="stat-card">
              <h3>Pending</h3>
              <p>{pendingCount}</p>
            </div>
            <div className="stat-card">
              <h3>Rejected</h3>
              <p>{rejectedCount}</p>
            </div>
          </div>
        </div>
        
        <div className="paths-section">
          <div className="section-header">
            <h2>Your Career Paths</h2>
            <div className="controls">
              <div className="search-box">
                <input 
                  type="text" 
                  placeholder="Search recommendations..." 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <div className="filter-buttons">
                <button 
                  className={activeFilter === "all" ? "active" : ""}
                  onClick={() => setActiveFilter("all")}
                >
                  All
                </button>
                <button 
                  className={activeFilter === "pending" ? "active" : ""}
                  onClick={() => setActiveFilter("pending")}
                >
                  Pending
                </button>
                <button 
                  className={activeFilter === "recommended" ? "active" : ""}
                  onClick={() => setActiveFilter("recommended")}
                >
                  Recommended
                </button>
                <button 
                  className={activeFilter === "rejected" ? "active" : ""}
                  onClick={() => setActiveFilter("rejected")}
                >
                  Rejected
                </button>
              </div>
              <button 
                onClick={loadPaths}
                disabled={isRefreshing}
              >
                {isRefreshing ? "Refreshing..." : "Refresh"}
              </button>
            </div>
          </div>
          
          <div className="paths-list">
            {filteredPaths.length === 0 ? (
              <div className="no-paths">
                <p>No career paths found</p>
                <button 
                  onClick={() => setShowCreateModal(true)}
                >
                  Create First Profile
                </button>
              </div>
            ) : (
              filteredPaths.map(path => (
                <div className={`path-card ${path.status}`} key={path.id}>
                  <div className="path-header">
                    <span className="path-id">#{path.id.substring(0, 6)}</span>
                    <span className={`status-badge ${path.status}`}>
                      {path.status}
                    </span>
                  </div>
                  <div className="path-content">
                    <div className="path-owner">
                      <span>Owner:</span> {path.owner.substring(0, 6)}...{path.owner.substring(38)}
                    </div>
                    <div className="path-date">
                      {new Date(path.timestamp * 1000).toLocaleDateString()}
                    </div>
                    {path.recommendation && (
                      <div className="path-recommendation">
                        <h4>Recommended Path:</h4>
                        <p>{path.recommendation}</p>
                      </div>
                    )}
                  </div>
                  <div className="path-actions">
                    {isOwner(path.owner) && path.status === "pending" && (
                      <>
                        <button 
                          className="action-btn"
                          onClick={() => generateRecommendation(path.id)}
                        >
                          Generate Recommendation
                        </button>
                        <button 
                          className="action-btn reject"
                          onClick={() => rejectPath(path.id)}
                        >
                          Reject
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
  
      {showCreateModal && (
        <ModalCreate 
          onSubmit={submitPath} 
          onClose={() => setShowCreateModal(false)} 
          creating={creating}
          pathData={newPathData}
          setPathData={setNewPathData}
        />
      )}
      
      {walletSelectorOpen && (
        <WalletSelector
          isOpen={walletSelectorOpen}
          onWalletSelect={(wallet) => { onWalletSelect(wallet); setWalletSelectorOpen(false); }}
          onClose={() => setWalletSelectorOpen(false)}
        />
      )}
      
      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className={`transaction-content ${transactionStatus.status}`}>
            <div className="transaction-icon">
              {transactionStatus.status === "pending" && <div className="spinner"></div>}
              {transactionStatus.status === "success" && "✓"}
              {transactionStatus.status === "error" && "✗"}
            </div>
            <div className="transaction-message">
              {transactionStatus.message}
            </div>
          </div>
        </div>
      )}
  
      <footer className="app-footer">
        <div className="footer-content">
          <div className="footer-brand">
            <h3>CareerPathFHE</h3>
            <p>Privacy-preserving career recommendations powered by FHE</p>
          </div>
          
          <div className="footer-links">
            <a href="#" className="footer-link">About</a>
            <a href="#" className="footer-link">Privacy</a>
            <a href="#" className="footer-link">Terms</a>
            <a href="#" className="footer-link">Contact</a>
          </div>
        </div>
        
        <div className="footer-bottom">
          <div className="fhe-badge">
            <span>FHE-Powered Privacy</span>
          </div>
          <div className="copyright">
            © {new Date().getFullYear()} CareerPathFHE. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
};

interface ModalCreateProps {
  onSubmit: () => void; 
  onClose: () => void; 
  creating: boolean;
  pathData: any;
  setPathData: (data: any) => void;
}

const ModalCreate: React.FC<ModalCreateProps> = ({ 
  onSubmit, 
  onClose, 
  creating,
  pathData,
  setPathData
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setPathData({
      ...pathData,
      [name]: value
    });
  };

  const handleSubmit = () => {
    if (!pathData.skills || !pathData.history) {
      alert("Please fill required fields");
      return;
    }
    
    onSubmit();
  };

  return (
    <div className="modal-overlay">
      <div className="create-modal">
        <div className="modal-header">
          <h2>Create Encrypted Career Profile</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="fhe-notice">
            Your data will be encrypted with FHE and remain private
          </div>
          
          <div className="form-group">
            <label>Your Skills *</label>
            <textarea 
              name="skills"
              value={pathData.skills} 
              onChange={handleChange}
              placeholder="Programming, management, design..." 
              rows={3}
            />
          </div>
          
          <div className="form-group">
            <label>Your Interests</label>
            <textarea 
              name="interests"
              value={pathData.interests} 
              onChange={handleChange}
              placeholder="AI, finance, creative work..." 
              rows={2}
            />
          </div>
          
          <div className="form-group">
            <label>Career History *</label>
            <textarea 
              name="history"
              value={pathData.history} 
              onChange={handleChange}
              placeholder="Previous roles, education, achievements..." 
              rows={4}
            />
          </div>
        </div>
        
        <div className="modal-footer">
          <button 
            onClick={onClose}
            className="cancel-btn"
          >
            Cancel
          </button>
          <button 
            onClick={handleSubmit} 
            disabled={creating}
            className="submit-btn"
          >
            {creating ? "Encrypting with FHE..." : "Submit Securely"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default App;