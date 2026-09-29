import React, { useEffect, useState, useMemo } from "react";
import { api } from "../../api";
import { toast } from "react-toastify";

/**
 * Drawer for managing principal assignments for a single school.
 *
 * Props:
 * - show: boolean controlling visibility
 * - school: the school object selected
 * - users: array of all users (needed to derive principals list)
 * - onClose: callback when drawer should close
 * - onSaved: callback after saving assignments (optional)
 */
export default function SchoolPrincipalsDrawer({ show, school, users = [], onClose, onSaved }) {
  const [assigned, setAssigned] = useState([]); // IDs currently assigned
  const [initialAssigned, setInitialAssigned] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  // Derive list of principal users
  const principalUsers = useMemo(
    () => users.filter((u) => u.role === "principal"),
    [users]
  );

  // Load existing principals when drawer opens or school changes
  useEffect(() => {
    async function load() {
      if (!show || !school) return;
      setLoading(true);
      try {
        const list = await api.managerGetSchoolPrincipals(school.id);
        const ids = Array.isArray(list) ? list.map((u) => u.id) : [];
        setAssigned(ids);
        setInitialAssigned(ids);
      } catch (err) {
        console.error(err);
        setAssigned([]);
        setInitialAssigned([]);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [show, school]);

  // Filter principals list based on search and not already assigned
  const availablePrincipals = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return principalUsers
      .filter((u) => !assigned.includes(u.id))
      .filter((u) => {
        if (!term) return true;
        const name = (u.full_name || "").toLowerCase();
        const email = (u.email || "").toLowerCase();
        return name.includes(term) || email.includes(term);
      });
  }, [principalUsers, assigned, searchTerm]);

  // Track whether assignments have changed compared to initial snapshot. This
  // must be declared before any early return to comply with hook rules.
  const hasChanges = useMemo(() => {
    if (assigned.length !== initialAssigned.length) return true;
    for (const id of assigned) {
      if (!initialAssigned.includes(id)) return true;
    }
    return false;
  }, [assigned, initialAssigned]);

  // Do not render anything when drawer is closed or no school is selected. Hooks above
  // still execute so the order of hook calls remains consistent.
  if (!show || !school) return null;

  const addPrincipal = (userId) => {
    setAssigned((prev) => (prev.includes(userId) ? prev : [...prev, userId]));
  };

  const removePrincipal = (userId) => {
    setAssigned((prev) => prev.filter((id) => id !== userId));
  };


  const handleSave = async () => {
    if (!school) return;
    setSaving(true);
    try {
      await api.managerSetSchoolPrincipals(school.id, { userIds: assigned });
      toast.success("Saved");
      setInitialAssigned(assigned.slice());
      onSaved?.(school.id, assigned);
      onClose?.();
    } catch (err) {
      console.error(err);
      toast.error(err?.message || "Failed to save principals");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    // Revert to initial
    setAssigned(initialAssigned.slice());
    onClose?.();
  };

  return (
    <div className="drawer-backdrop" onClick={handleCancel}>
      <div
        className="drawer"
        onClick={(e) => {
          // prevent closing on clicks inside drawer
          e.stopPropagation();
        }}
      >
        <div className="drawer-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ fontWeight: 700 }}>
            School: {school.name}
          </div>
          <button className="btn" style={{ border: "none", background: "transparent", padding: 0 }} onClick={handleCancel}>
            ×
          </button>
        </div>
        {loading ? (
          <div>Loading principals...</div>
        ) : principalUsers.length === 0 ? (
          <div>No principals found. Create a principal user first, then assign them to schools.</div>
        ) : (
          <>
            {/* Assigned principals */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>Assigned principals</div>
              {assigned.length === 0 ? (
                <div className="small">No principals assigned to this school yet.</div>
              ) : (
                <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                  {assigned.map((id) => {
                    const u = users.find((x) => String(x.id) === String(id));
                    const label = u ? u.full_name || u.email || u.id : id;
                    return (
                      <div key={id} className="chip">
                        <span>{label}</span>
                        <button
                          type="button"
                          className="chip-remove"
                          onClick={() => removePrincipal(id)}
                          aria-label="Remove principal"
                        >
                          ×
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            {/* Add principal search */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>Add principal</div>
              <input
                className="input full"
                placeholder="Find a principal…"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{ marginBottom: 6 }}
              />
              <div style={{ maxHeight: 200, overflowY: "auto" }}>
                {availablePrincipals.length === 0 ? (
                  <div className="small">No principals available</div>
                ) : (
                  availablePrincipals.map((u) => {
                    const label = u.full_name || u.email || u.id;
                    return (
                      <div
                        key={u.id}
                        className="access-list-item"
                        style={{ cursor: "pointer" }}
                        onClick={() => addPrincipal(u.id)}
                      >
                        <div>{label}</div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
            {/* Drawer footer */}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button className="btn" onClick={handleCancel} disabled={saving}>
                Cancel
              </button>
              <button className="btn primary" onClick={handleSave} disabled={saving || !hasChanges}>
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}