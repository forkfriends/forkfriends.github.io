import React, { useEffect, useRef, useState } from 'react';
import { View, Text } from 'react-native';

type Props = {
  adUnitId?: string;
  variant?: 'banner' | 'square' | 'vertical';
};

const TEST_ADSENSE_CLIENT = 'ca-pub-3940256099942544'; // Google test AdSense client (web)
const TEST_ADSENSE_SLOT = '2003685630'; // Google test AdSense slot (web)

export default function AdBanner({ variant = 'banner' }: Props) {
  return <WebAdSenseBanner variant={variant} />;
}

function WebAdSenseBanner({ variant }: { variant: 'banner' | 'square' | 'vertical' }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [ready, setReady] = useState(false);
  const [fallback, setFallback] = useState(false);
  const clientId = process.env.EXPO_PUBLIC_ADSENSE_CLIENT_ID || TEST_ADSENSE_CLIENT;
  const slotId = process.env.EXPO_PUBLIC_ADSENSE_SLOT_ID || TEST_ADSENSE_SLOT;
  const forcePlaceholder = process.env.EXPO_PUBLIC_AD_PLACEHOLDER === '1';

  if (forcePlaceholder) {
    return (
      <View style={{ alignItems: 'center' }}>
        <PlaceholderCard />
      </View>
    );
  }

  useEffect(() => {
    if (typeof document === 'undefined') return;
    let cancelled = false;
    const fallbackTimer = setTimeout(() => setFallback(true), 4000);

    const ensureScript = () =>
      new Promise<void>((resolve, reject) => {
        const existing = document.querySelector<HTMLScriptElement>(
          'script[src^="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js"]'
        );
        if (existing) {
          if (existing.getAttribute('data-loaded') === 'true') {
            resolve();
            return;
          }
          existing.addEventListener('load', () => resolve());
          existing.addEventListener('error', (e) => reject(e));
          return;
        }

        const script = document.createElement('script');
        script.async = true;
        script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${clientId}`;
        script.crossOrigin = 'anonymous';
        script.onload = () => {
          script.setAttribute('data-loaded', 'true');
          resolve();
        };
        script.onerror = (e) => reject(e);
        document.head.appendChild(script);
      });

    ensureScript()
      .then(() => {
        if (cancelled || !containerRef.current) return;
        containerRef.current.innerHTML = '';
        const ins = document.createElement('ins');
        ins.className = 'adsbygoogle';
        ins.style.display = 'block';
        const dims = getDims(variant);
        ins.style.width = dims.width;
        ins.style.height = dims.height;
        ins.setAttribute('data-ad-client', clientId);
        ins.setAttribute('data-ad-slot', slotId);
        ins.setAttribute('data-adtest', 'on'); // keep test creatives on web
        ins.setAttribute('data-ad-format', 'auto');
        ins.setAttribute('data-full-width-responsive', 'true');
        containerRef.current.appendChild(ins);
        try {
          // @ts-expect-error adsbygoogle injected by script
          (window.adsbygoogle = window.adsbygoogle || []).push({});
          setReady(true);
        } catch (err) {
          console.warn('[AdBanner][web] Failed to render ad', err);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          console.warn('[AdBanner][web] Failed to load AdSense script', err);
        }
      });

    return () => {
      cancelled = true;
      clearTimeout(fallbackTimer);
      if (containerRef.current) {
        containerRef.current.innerHTML = '';
      }
    };
  }, [clientId, slotId]);

  return (
    <View style={{ alignItems: 'center' }}>
      <View
        style={{
          width: getDims(variant).containerWidth as any,
          maxWidth: getDims(variant).maxWidth as any,
          minHeight: getDims(variant).minHeight,
          backgroundColor: '#f8fafc',
          borderWidth: 1,
          borderColor: '#e5e7eb',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}>
        {!ready ? (
          fallback ? (
            <PlaceholderCard />
          ) : (
            <Text style={{ fontSize: 12, color: '#6b7280', padding: 8 }}>Loading ad…</Text>
          )
        ) : null}
        <div
          ref={containerRef}
          style={{ width: '100%', height: '100%', display: 'flex', justifyContent: 'center' }}
        />
      </View>
    </View>
  );
}

function PlaceholderCard() {
  return (
    <View
      style={{
        height: 50,
        width: 320,
        maxWidth: '100%',
        paddingHorizontal: 12,
        paddingVertical: 10,
        backgroundColor: '#eef2ff',
        borderColor: '#c7d2fe',
        borderWidth: 1,
        borderRadius: 4,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <Text style={{ fontSize: 12, color: '#4b5563' }}>Ad placeholder</Text>
    </View>
  );
}

function getDims(variant: 'banner' | 'square' | 'vertical') {
  switch (variant) {
    case 'square':
      return {
        width: '250px',
        height: '250px',
        containerWidth: '100%',
        maxWidth: 320,
        minHeight: 250,
      };
    case 'vertical':
      return {
        width: '120px',
        height: '600px',
        containerWidth: '100%',
        maxWidth: 160,
        minHeight: 600,
      };
    default:
      return {
        width: '100%',
        height: '90px',
        containerWidth: '100%',
        maxWidth: '100%',
        minHeight: 90,
      };
  }
}
