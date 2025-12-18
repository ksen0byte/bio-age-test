const DB_NAME = 'BioAgeDB';

const run = (mode, callback) => new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = e => e.target.result.createObjectStore('results', { keyPath: 'id', autoIncrement: true });
    req.onsuccess = e => {
        const tx = e.target.result.transaction('results', mode);
        const req = callback(tx.objectStore('results'));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    };
    req.onerror = () => reject(req.error);
});

export const db = {
    save: (data) => run('readwrite', store => store.add({ date: new Date(), ...data })),
    getAll: () => run('readonly', store => store.getAll()),
    delete: (id) => run('readwrite', store => store.delete(id))
};