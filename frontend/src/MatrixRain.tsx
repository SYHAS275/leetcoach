import React, { useEffect, useRef } from 'react';

const MatrixRain = () => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let width = window.innerWidth;
        let height = window.innerHeight;

        let drops: number[] = [];
        const fontSize = 14;

        // Initialize drops based on current width
        const initDrops = () => {
            const columns = Math.ceil(width / fontSize);
            const currentLength = drops.length;

            // Only add new drops if width increased
            if (columns > currentLength) {
                for (let i = currentLength; i < columns; i++) {
                    drops[i] = Math.random() * -100;
                }
            }
        };

        const resize = () => {
            width = window.innerWidth;
            height = window.innerHeight;
            canvas.width = width;
            canvas.height = height;
            initDrops();
        };

        window.addEventListener('resize', resize);
        resize(); // Initial sizing

        // Characters
        const chars = '01アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン<>{}[]/\\|;:+=-_!@#$%^&*()';
        const charArray = chars.split('');

        let animationId: number;

        const draw = () => {
            // Trail effect
            ctx.fillStyle = 'rgba(5, 5, 5, 0.05)';
            ctx.fillRect(0, 0, width, height);

            ctx.font = `${fontSize}px monospace`;

            // Draw based on current width columns (safe even if drops array is bigger or smaller, but we handle resizing)
            // Actually, we should iterate up to the needed columns
            const columns = Math.ceil(width / fontSize);

            for (let i = 0; i < columns; i++) {
                // Safety init if not present (though initDrops should handle it)
                if (drops[i] === undefined) {
                    drops[i] = Math.random() * -100;
                }

                // Random color logic
                const random = Math.random();
                if (random > 0.98) ctx.fillStyle = '#6366f1'; // Primary
                else if (random > 0.95) ctx.fillStyle = '#bc13fe'; // Accent
                else ctx.fillStyle = '#1f2937'; // gray

                const text = charArray[Math.floor(Math.random() * charArray.length)];
                ctx.fillText(text, i * fontSize, drops[i] * fontSize);

                // Reset
                if (drops[i] * fontSize > height && Math.random() > 0.975) {
                    drops[i] = 0;
                }

                drops[i]++;
            }
            animationId = requestAnimationFrame(draw);
        };

        draw();

        return () => {
            window.removeEventListener('resize', resize);
            cancelAnimationFrame(animationId);
        };
    }, []);

    return (
        <canvas
            ref={canvasRef}
            className="fixed inset-0 z-0 pointer-events-none opacity-40 mix-blend-screen"
        />
    );
};

export default MatrixRain;
