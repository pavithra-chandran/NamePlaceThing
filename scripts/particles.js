document.addEventListener('DOMContentLoaded', function() {
  for (let i = 0; i < 20; i++) {
    createParticle();
  }
  
  for (let i = 0; i < 30; i++) {
    createSmallParticle();
  }
  
  for (let i = 0; i < 50; i++) {
    createDustParticle();
  }
  
  function createParticle() {
    const particle = document.createElement('div');
    particle.classList.add('particle');
    
    const size = Math.random() * 10 + 5;
    const posX = Math.random() * window.innerWidth;
    const posY = Math.random() * window.innerHeight;
    
    particle.style.width = `${size}px`;
    particle.style.height = `${size}px`;
    particle.style.left = `${posX}px`;
    particle.style.top = `${posY}px`;
    particle.style.opacity = Math.random() * 0.7 + 0.3;
    
    const animationDuration = Math.random() * 20 + 10;
    particle.style.animationDuration = `${animationDuration}s`;
    
    const animationDelay = Math.random() * 5;
    particle.style.animationDelay = `-${animationDelay}s`;
    
    document.getElementById('wrapper').appendChild(particle);
    
    particle.addEventListener('mouseover', () => {
      particle.style.transform = 'scale(1.5)';
      particle.style.opacity = '0.5';
    });
    
    particle.addEventListener('mouseout', () => {
      particle.style.transform = 'scale(1)';
      particle.style.opacity = '1';
    });
  }
  
  function createSmallParticle() {
    const particle = document.createElement('div');
    particle.classList.add('particle-small');
    
    const size = Math.random() * 5 + 2;
    const posX = Math.random() * window.innerWidth;
    const posY = Math.random() * window.innerHeight;
    
    particle.style.width = `${size}px`;
    particle.style.height = `${size}px`;
    particle.style.left = `${posX}px`;
    particle.style.top = `${posY}px`;
    particle.style.opacity = Math.random() * 0.6 + 0.2;
    
    const animationDuration = Math.random() * 15 + 8;
    particle.style.animationDuration = `${animationDuration}s`;
    
    const animationDelay = Math.random() * 8;
    particle.style.animationDelay = `-${animationDelay}s`;
    
    document.getElementById('wrapper').appendChild(particle);
    
    particle.addEventListener('mouseover', () => {
      particle.style.transform = 'scale(2)';
      particle.style.opacity = '0.7';
    });
    
    particle.addEventListener('mouseout', () => {
      particle.style.transform = 'scale(1)';
      particle.style.opacity = '0.4';
    });
  }
  
  function createDustParticle() {
    const particle = document.createElement('div');
    particle.classList.add('particle-dust');
    
    const size = Math.random() * 2 + 1;
    const posX = Math.random() * window.innerWidth;
    const posY = Math.random() * window.innerHeight;
    
    particle.style.width = `${size}px`;
    particle.style.height = `${size}px`;
    particle.style.left = `${posX}px`;
    particle.style.top = `${posY}px`;
    particle.style.opacity = Math.random() * 0.4 + 0.1;
    
    const animationDuration = Math.random() * 8 + 5;
    particle.style.animationDuration = `${animationDuration}s`;
    
    const animationDelay = Math.random() * 5;
    particle.style.animationDelay = `-${animationDelay}s`;
    
    document.getElementById('wrapper').appendChild(particle);
  }
  
  document.addEventListener('mousemove', function(e) {
    const particles = document.querySelectorAll('.particle, .particle-small');
    const mouseX = e.clientX;
    const mouseY = e.clientY;
    
    particles.forEach((particle) => {
      const rect = particle.getBoundingClientRect();
      const particleX = rect.left + rect.width / 2;
      const particleY = rect.top + rect.height / 2;
      const distance = Math.sqrt(
        Math.pow(mouseX - particleX, 2) + 
        Math.pow(mouseY - particleY, 2)
      );
      
      const interactionRadius = particle.classList.contains('particle') ? 150 : 100;
      
      if (distance < interactionRadius) {
        const angle = Math.atan2(mouseY - particleY, mouseX - particleX);
        const force = (interactionRadius - distance) / 15;
        const x = Math.cos(angle) * force;
        const y = Math.sin(angle) * force;
        
        particle.style.transform = `translate(${x}px, ${y}px) scale(1.1)`;
        particle.style.opacity = 1;
        particle.style.boxShadow = particle.classList.contains('particle') ? 
          '0 0 20px 3px rgba(255, 255, 255, 1)' : 
          '0 0 15px 2px rgba(255, 255, 255, 0.8)';
      } else {
        if (particle.classList.contains('particle')) {
          particle.style.opacity = Math.random() * 0.7 + 0.3;
          particle.style.boxShadow = '0 0 15px 2px rgba(255, 255, 255, 0.8)';
        } else {
          particle.style.opacity = Math.random() * 0.6 + 0.2;
          particle.style.boxShadow = '0 0 10px 1px rgba(255, 255, 255, 0.6)';
        }
        particle.style.transform = 'translate(0, 0) scale(1)';
      }
    });
  });
});