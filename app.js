// fetch the metadata file and list boat names
fetch('public/dgbr2025/RaceSetup.json')
  .then(r => r.json())
  .then(data => {
    const ul = document.getElementById('boatlist');
    data.boats.forEach(b => {
      const li = document.createElement('li');
      li.textContent = b.name;
      ul.appendChild(li);
    });
  })
  .catch(console.error);
