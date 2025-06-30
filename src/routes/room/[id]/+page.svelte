<script>
	import { page } from '$app/stores';
	import { Button } from "$lib/components/ui/button";
	import { goto } from '$app/navigation';
	import { onMount, onDestroy } from 'svelte';
	import { supabase } from '$lib/supabase.js';
	import KakaoMap from '$lib/components/KakaoMap.svelte';

	let roomId = $page.params.id;
	let displayName = '';
	let joined = false;
	/** @type {Array<{id: string, name: string, location_lat?: number, location_lng?: number, is_creator: boolean}>} */
	let participants = [];
	/** @type {Array<{sender: string, content: string, created_at: string}>} */
	let messages = [];
	let newMessage = '';
	/** @type {{lat: number, lng: number} | null} */
	let userLocation = null;
	/** @type {{lat: number, lng: number, name?: string, address?: string} | null} */
	let destination = null;
	let isCreator = false;
	let currentUserId = '';
	/** @type {any} */
	let participantsChannel = null;
	/** @type {any} */
	let messagesChannel = null;
	let chatExpanded = false;
	let participantsExpanded = false;
	let showDestinationSearch = false;
	let searchQuery = '';
	/** @type {Array<{id: string, name: string, address: string, roadAddress?: string, lat: number, lng: number, category?: string}>} */
	let searchResults = [];
	let isSearching = false;
	/** @type {NodeJS.Timeout | undefined} */
	let searchTimeout;
	let isLocationTracking = false;
	let watchId = null;
	let showDestinationConfirm = false;
	/** @type {{lat: number, lng: number, name?: string, address?: string} | null} */
	let pendingDestination = null;
	/** @type {any} */
	let presenceChannel = null;
	/** @type {any} */
	let roomChannel = null;
	let heartbeatInterval = null;
	let lastHeartbeat = null;

	// Distance calculation function
	/**
	 * @param {{lat: number, lng: number}} point1
	 * @param {{lat: number, lng: number}} point2
	 * @returns {number}
	 */
	function calculateDistance(point1, point2) {
		const R = 6371; // Earth's radius in kilometers
		const dLat = (point2.lat - point1.lat) * Math.PI / 180;
		const dLng = (point2.lng - point1.lng) * Math.PI / 180;
		const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
				Math.cos(point1.lat * Math.PI / 180) * Math.cos(point2.lat * Math.PI / 180) *
				Math.sin(dLng/2) * Math.sin(dLng/2);
		const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
		return R * c;
	}

	// 장소 검색 함수
	/**
	 * @param {string} query
	 */
	async function searchPlaces(query) {
		if (!query.trim()) {
			console.log('검색어가 비어있습니다');
			return;
		}

		console.log('검색 시작:', query);
		// @ts-ignore
		console.log('카카오 API 상태:', !!window.kakao?.maps?.services);

		// @ts-ignore
		if (!window.kakao?.maps?.services) {
			console.error('카카오 Places API가 로드되지 않았습니다');
			isSearching = false;
			return;
		}

		isSearching = true;
		searchResults = [];

		try {
			// @ts-ignore
			const ps = new window.kakao.maps.services.Places();
			
			// 키워드 검색
			ps.keywordSearch(query, (data, status) => {
				console.log('검색 결과:', { data, status });
				
				// @ts-ignore
				if (status === window.kakao?.maps?.services?.Status.OK) {
					const newResults = data.map(place => ({
						id: place.id,
						name: place.place_name,
						address: place.address_name,
						roadAddress: place.road_address_name,
						phone: place.phone,
						lat: parseFloat(place.y),
						lng: parseFloat(place.x),
						category: place.category_group_name || place.category_name
					}));
					searchResults = newResults;
					console.log('검색 결과 처리됨:', newResults.length, '개');
				// @ts-ignore
				} else if (status === window.kakao?.maps?.services?.Status.ZERO_RESULT) {
					console.log('검색 결과 없음');
					searchResults = [];
				// @ts-ignore
				} else if (status === window.kakao?.maps?.services?.Status.ERROR) {
					console.error('검색 오류 발생');
					searchResults = [];
				}
				isSearching = false;
			});
		} catch (error) {
			console.error('검색 함수 실행 오류:', error);
			isSearching = false;
		}
	}

	// 검색 결과 선택 (지도만 이동)
	/**
	 * @param {{id: string, name: string, address: string, roadAddress?: string, lat: number, lng: number, category?: string}} place
	 */
	function moveToLocation(place) {
		console.log('위치로 이동:', place);
		
		// KakaoMap 컴포넌트에 지도 이동 이벤트 전달
		if (typeof window !== 'undefined') {
			window.dispatchEvent(new CustomEvent('moveMapToLocation', {
				detail: {
					lat: place.lat,
					lng: place.lng,
					name: place.name,
					address: place.roadAddress || place.address
				}
			}));
		}

		// 검색창 닫기
		showDestinationSearch = false;
		searchQuery = '';
		searchResults = [];
	}

	// 목적지 설정 확인 다이얼로그 표시
	/**
	 * @param {{lat: number, lng: number, name?: string, address?: string}} location
	 */
	function showDestinationConfirmDialog(location) {
		console.log('=== showDestinationConfirmDialog 함수 시작 ===');
		console.log('전달받은 location:', location);
		console.log('현재 isCreator:', isCreator);
		console.log('현재 joined:', joined);
		console.log('현재 displayName:', displayName);
		console.log('현재 currentUserId:', currentUserId);
		
		if (!isCreator) {
			console.log('방장이 아님 - 목적지 설정 거부');
			alert('목적지 설정은 방장만 가능합니다.');
			return;
		}
		
		console.log('방장 확인됨 - 목적지 설정 진행');
		pendingDestination = location;
		showDestinationConfirm = true;
		console.log('pendingDestination 설정:', pendingDestination);
		console.log('showDestinationConfirm 설정:', showDestinationConfirm);
		console.log('=== 목적지 확인 다이얼로그 표시 완료 ===');
	}

	// 실제 목적지 설정 함수
	async function confirmDestination() {
		if (!pendingDestination) {
			console.error('pendingDestination이 비어있습니다');
			return;
		}
		
		console.log('목적지 설정 확인 시작:', pendingDestination);
		console.log('supabase 상태:', !!supabase);
		console.log('roomId:', roomId);
		console.log('isCreator:', isCreator);

		if (!supabase) {
			// Demo mode: 로컬에서만 업데이트
			destination = {
				lat: pendingDestination.lat,
				lng: pendingDestination.lng,
				name: pendingDestination.name,
				address: pendingDestination.address
			};
			console.log('목적지 설정:', destination, '(demo mode)');
		} else {
			// Supabase에 목적지 저장 (실시간 동기화를 위해 DB만 업데이트)
			console.log('Supabase 업데이트 시작...');
			const updateData = {
				destination_lat: pendingDestination.lat,
				destination_lng: pendingDestination.lng,
				destination_name: pendingDestination.name,
				destination_address: pendingDestination.address
			};
			console.log('업데이트 데이터:', updateData);
			
			const { data, error } = await supabase
				.from('rooms')
				.update(updateData)
				.eq('id', roomId)
				.select();

			console.log('Supabase 업데이트 결과:', { data, error });
			
			if (error) {
				console.error('목적지 설정 오류:', error);
				// 오류 시 사용자에게 알림
				alert(`목적지 설정에 실패했습니다: ${error.message}`);
				return; // 오류 시 대화상자 닫지 않음
			} else {
				console.log('목적지 설정 성공:', pendingDestination.name || '선택한 위치');
				console.log('업데이트된 데이터:', data);
				
				// 로컬 상태 즉시 업데이트 (실시간 리스너와 별도로)
				console.log('로컬 destination 상태 업데이트 시작');
				console.log('업데이트 전 destination:', destination);
				
				destination = {
					lat: pendingDestination.lat,
					lng: pendingDestination.lng,
					name: pendingDestination.name,
					address: pendingDestination.address
				};
				
				console.log('업데이트 후 destination:', destination);
				console.log('로컬 상태 업데이트 완료!');
			}
		}

		// 확인 다이얼로그 닫기
		showDestinationConfirm = false;
		pendingDestination = null;
		
		// 임시 마커 제거
		if (typeof window !== 'undefined') {
			window.dispatchEvent(new CustomEvent('cancelTempMarker'));
			console.log('임시 마커 제거 이벤트 전송');
		}
	}

	// 목적지 설정 취소
	function cancelDestination() {
		showDestinationConfirm = false;
		pendingDestination = null;
		
		// KakaoMap에 임시 마커 제거 이벤트 전달
		if (typeof window !== 'undefined') {
			window.dispatchEvent(new CustomEvent('cancelTempMarker'));
		}
	}

	// 목적지 제거 함수 (방장만 가능)
	async function removeDestination() {
		if (!isCreator) {
			alert('목적지는 방장만 제거할 수 있습니다.');
			return;
		}

		if (!confirm('목적지를 제거하시겠습니까?')) {
			return;
		}

		if (!supabase) {
			// Demo mode
			destination = null;
			console.log('목적지 제거됨 (demo mode)');
		} else {
			// Supabase에서 목적지 제거
			const { error } = await supabase
				.from('rooms')
				.update({
					destination_lat: null,
					destination_lng: null,
					destination_name: null,
					destination_address: null
				})
				.eq('id', roomId);

			if (error) {
				console.error('목적지 제거 오류:', error);
				alert('목적지 제거에 실패했습니다.');
			} else {
				console.log('목적지가 제거되었습니다');
				// 실시간 업데이트는 postgres_changes 이벤트로 처리됨
			}
		}
	}

	// 검색어 변경 시 자동 검색 (디바운싱)
	function handleSearchQueryChange() {
		if (searchTimeout) {
			clearTimeout(searchTimeout);
		}
		if (searchQuery.length > 1) {
			searchTimeout = setTimeout(() => {
				searchPlaces(searchQuery);
			}, 300);
		} else if (searchQuery.length === 0) {
			searchResults = [];
		}
	}
	
	$: searchQuery, handleSearchQueryChange();

	// Check if user is the room creator (simplified check)
	onMount(async () => {
		console.log('=== onMount 시작 - 방장 확인 ===');
		console.log('roomId:', roomId);
		
		const creatorId = localStorage.getItem(`room_${roomId}_creator`);
		console.log('localStorage에서 가져온 creatorId:', creatorId);
		
		isCreator = creatorId === 'true';
		console.log('isCreator 설정됨:', isCreator);
		
		// 임시: URL 파라미터로 방장 설정 확인 (테스트용)
		const urlParams = new URLSearchParams(window.location.search);
		if (urlParams.get('creator') === 'true') {
			isCreator = true;
			localStorage.setItem(`room_${roomId}_creator`, 'true');
			console.log('URL 파라미터로 방장 설정됨');
		}
		
		console.log('최종 isCreator 값:', isCreator);
		
		// Check if user has existing session
		const existingSession = localStorage.getItem(`room_${roomId}_user`);
		if (existingSession) {
			try {
				const session = JSON.parse(existingSession);
				displayName = session.name;
				currentUserId = session.id;
				joined = true;
				
				// Verify the session is still valid in database
				if (supabase) {
					const { data: participant } = await supabase
						.from('participants')
						.select('id')
						.eq('id', currentUserId)
						.single();
					
					if (!participant) {
						// Session invalid, clear it
						localStorage.removeItem(`room_${roomId}_user`);
						joined = false;
						displayName = '';
						currentUserId = '';
					} else {
						// Update last activity
						await supabase
							.from('participants')
							.update({ updated_at: new Date().toISOString() })
							.eq('id', currentUserId);
					}
				}
			} catch (error) {
				console.error('Error parsing session:', error);
				localStorage.removeItem(`room_${roomId}_user`);
			}
		}
		
		// 지도에서 목적지 설정 이벤트 리스너 추가
		if (typeof window !== 'undefined') {
			window.addEventListener('setDestinationFromMap', (event) => {
				console.log('=== 부모: setDestinationFromMap 이벤트 수신 ===');
				console.log('이벤트:', event);
				console.log('이벤트 detail:', event.detail);
				console.log('현재 isCreator:', isCreator);
				console.log('현재 displayName:', displayName);
				console.log('현재 currentUserId:', currentUserId);
				
				showDestinationConfirmDialog(event.detail);
			});
			
			// 브라우저 창 닫기/새로고침 시 참여자 제거
			window.addEventListener('beforeunload', handleBeforeUnload);
			window.addEventListener('pagehide', handlePageHide);
		}
		
		if (!supabase) {
			console.warn('Supabase not configured. Running in demo mode.');
			return;
		}

		// Load existing data
		await loadRoomData();
		await setupRealtimeSubscriptions();
	});

	onDestroy(() => {
		// Clean up subscriptions
		if (participantsChannel && supabase) {
			supabase.removeChannel(participantsChannel);
		}
		if (messagesChannel && supabase) {
			supabase.removeChannel(messagesChannel);
		}
		if (presenceChannel && supabase) {
			supabase.removeChannel(presenceChannel);
		}
		if (roomChannel && supabase) {
			supabase.removeChannel(roomChannel);
		}
		
		// 하트비트 정리
		if (heartbeatInterval) {
			clearInterval(heartbeatInterval);
			heartbeatInterval = null;
		}
		
		// 위치 추적 정리
		if (watchId !== null) {
			navigator.geolocation.clearWatch(watchId);
			watchId = null;
		}
		isLocationTracking = false;
		
		// 이벤트 리스너 정리
		if (typeof window !== 'undefined') {
			window.removeEventListener('setDestinationFromMap', showDestinationConfirmDialog);
			window.removeEventListener('beforeunload', handleBeforeUnload);
			window.removeEventListener('pagehide', handlePageHide);
		}
		
		// 수동으로 나갈 때도 참에자 제거
		if (supabase && currentUserId && joined) {
			leaveRoomCleanup();
		}
	});

	async function loadRoomData() {
		if (!supabase) return;

		// Load participants
		const { data: participantsData } = await supabase
			.from('participants')
			.select('*')
			.eq('room_id', roomId);
		
		if (participantsData) {
			participants = participantsData;
		}

		// Load messages
		const { data: messagesData } = await supabase
			.from('messages')
			.select('*')
			.eq('room_id', roomId)
			.order('created_at', { ascending: true });
		
		if (messagesData) {
			messages = messagesData;
		}

		// Load room destination
		const { data: roomData } = await supabase
			.from('rooms')
			.select('destination_lat, destination_lng, destination_name, destination_address')
			.eq('id', roomId)
			.single();
		
		if (roomData && roomData.destination_lat && roomData.destination_lng) {
			destination = {
				lat: roomData.destination_lat,
				lng: roomData.destination_lng,
				name: roomData.destination_name,
				address: roomData.destination_address
			};
		}
	}

	async function setupRealtimeSubscriptions() {
		if (!supabase) return;

		// Subscribe to participants changes
		participantsChannel = supabase
			.channel(`participants:${roomId}`)
			.on('postgres_changes', {
				event: '*',
				schema: 'public',
				table: 'participants',
				filter: `room_id=eq.${roomId}`
			}, async (payload) => {
				console.log('Participants change:', payload);
				await loadRoomData(); // Reload all data for simplicity
			})
			.subscribe();

		// Subscribe to messages changes
		messagesChannel = supabase
			.channel(`messages:${roomId}`)
			.on('postgres_changes', {
				event: 'INSERT',
				schema: 'public',
				table: 'messages',
				filter: `room_id=eq.${roomId}`
			}, (payload) => {
				console.log('New message:', payload);
				if (payload.new) {
					messages = [...messages, {
						sender: payload.new.sender,
						content: payload.new.content,
						created_at: payload.new.created_at
					}];
				}
			})
			.subscribe();

		// 목적지 변경사항 감지 (rooms 테이블)
		console.log('=== 실시간 리스너 설정 시작 ===');
		console.log('roomId:', roomId);
		
		roomChannel = supabase
			.channel(`rooms_updates:${roomId}`)
			.on('postgres_changes', {
				event: '*', // 모든 이벤트 수신
				schema: 'public',
				table: 'rooms',
				filter: `id=eq.${roomId}`
			}, async (payload) => {
				console.log('=== Room Event 수신됨! ===');
				console.log('이벤트 타입:', payload.eventType);
				console.log('Full payload:', payload);
				console.log('Old data:', payload.old);
				console.log('New data:', payload.new);
				
				// 목적지 업데이트
				if (payload.new) {
					const newData = payload.new;
					console.log('새로운 목적지 데이터:', {
						lat: newData.destination_lat,
						lng: newData.destination_lng,
						name: newData.destination_name,
						address: newData.destination_address
					});
					
					if (newData.destination_lat && newData.destination_lng) {
						const newDestination = {
							lat: newData.destination_lat,
							lng: newData.destination_lng,
							name: newData.destination_name,
							address: newData.destination_address
						};
						console.log('목적지 업데이트 전:', destination);
						destination = newDestination;
						console.log('목적지 업데이트 후:', destination);
						console.log('목적지가 실시간으로 업데이트되었습니다!');
					} else {
						// 목적지가 제거된 경우
						console.log('목적지 제거 전:', destination);
						destination = null;
						console.log('목적지 제거 후:', destination);
						console.log('목적지가 제거되었습니다!');
					}
				} else {
					console.warn('새로운 데이터가 없습니다');
				}
			})
			.subscribe((status) => {
				console.log('=== roomChannel 구독 상태 ===');
				console.log('구독 상태:', status);
				if (status === 'SUBSCRIBED') {
					console.log('rooms 테이블 실시간 리스너 구독 성공!');
				} else if (status === 'CHANNEL_ERROR') {
					console.error('rooms 테이블 실시간 리스너 구독 실패!');
				}
			});

		console.log('=== roomChannel 설정 완료 ===');
		
		// 백업 폴링: 실시간 리스너가 작동하지 않을 경우를 대비
		console.log('=== 백업 폴링 시작 ===');
		setInterval(async () => {
			try {
				const { data: roomData } = await supabase
					.from('rooms')
					.select('destination_lat, destination_lng, destination_name, destination_address')
					.eq('id', roomId)
					.single();
				
				if (roomData) {
					const newDestination = roomData.destination_lat && roomData.destination_lng ? {
						lat: roomData.destination_lat,
						lng: roomData.destination_lng,
						name: roomData.destination_name,
						address: roomData.destination_address
					} : null;
					
					// 목적지가 변경되었는지 확인
					const hasChanged = JSON.stringify(destination) !== JSON.stringify(newDestination);
					if (hasChanged) {
						console.log('폴링으로 목적지 변경 감지:', newDestination);
						destination = newDestination;
					}
				}
			} catch (error) {
				console.error('폴링 오류:', error);
			}
		}, 5000); // 5초마다 체크
		
		// 사용자 생존 상태 추적을 위한 Presence 채널 설정
		await setupPresenceTracking();
	}

	// 사용자 생존 상태 추적 설정
	async function setupPresenceTracking() {
		if (!supabase || !currentUserId) return;

		// Presence 채널 생성
		presenceChannel = supabase
			.channel(`presence:${roomId}`, {
				config: {
					presence: {
						key: currentUserId
					}
				}
			})
			.on('presence', { event: 'sync' }, () => {
				console.log('Presence sync');
				const presenceState = presenceChannel.presenceState();
				console.log('Active users:', Object.keys(presenceState));
			})
			.on('presence', { event: 'join' }, ({ key, newPresences }) => {
				console.log('User joined:', key, newPresences);
			})
			.on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
				console.log('User left:', key, leftPresences);
				// 다른 사용자가 떠났을 때 참에자 목록에서 제거
				removeDisconnectedUser(key);
			})
			.subscribe(async (status) => {
				if (status === 'SUBSCRIBED') {
					// 자신의 presence 상태 전송
					await presenceChannel.track({
						user_id: currentUserId,
						user_name: displayName,
						joined_at: new Date().toISOString()
					});
					console.log('Presence tracking started for:', currentUserId);
					
					// Presence 연결 완료 후 위치 추적 시작
					setTimeout(() => startLocationTracking(), 500);
				}
			});

		// 하트비트 시스템 시작
		startHeartbeat();
	}

	// 사용자 생존 상태 하트비트
	function startHeartbeat() {
		if (!supabase || !currentUserId) return;

		// 30초마다 하트비트 전송
		heartbeatInterval = setInterval(async () => {
			try {
				const now = new Date().toISOString();
				await supabase
					.from('participants')
					.update({ 
						last_heartbeat: now,
						updated_at: now 
					})
					.eq('id', currentUserId);
				
				lastHeartbeat = now;
				console.log('Heartbeat sent:', now);
			} catch (error) {
				console.error('Heartbeat error:', error);
			}
		}, 30000); // 30초
	}

	// 연결이 끔어진 사용자 제거
	async function removeDisconnectedUser(userId) {
		if (!supabase || userId === currentUserId) return;

		try {
			// 해당 사용자를 참에자 목록에서 제거
			await supabase
				.from('participants')
				.delete()
				.eq('id', userId);
			
			console.log('연결 끔어진 사용자 제거:', userId);
		} catch (error) {
			console.error('사용자 제거 오류:', error);
		}
	}

	async function joinRoom() {
		if (displayName.trim()) {
			joined = true;
			
			if (!supabase) {
				console.log(`Joining room ${roomId} as ${displayName} (demo mode)`);
				return;
			}

			// Create room if it doesn't exist (for creator)
			if (isCreator) {
				await supabase
					.from('rooms')
					.upsert({
						id: roomId,
						creator_name: displayName
					});
			}

			// Check if user already exists in this room (by name and room_id)
			const { data: existingParticipant } = await supabase
				.from('participants')
				.select('id')
				.eq('room_id', roomId)
				.eq('name', displayName)
				.single();

			if (existingParticipant) {
				// User already exists, just use existing ID
				currentUserId = existingParticipant.id;
				console.log(`Rejoined room ${roomId} as ${displayName} (existing participant)`);
				
				// Update last activity and heartbeat time
				const now = new Date().toISOString();
				await supabase
					.from('participants')
					.update({ 
						updated_at: now,
						last_heartbeat: now 
					})
					.eq('id', currentUserId);
				
				// Store user session in localStorage
				localStorage.setItem(`room_${roomId}_user`, JSON.stringify({
					id: currentUserId,
					name: displayName,
					joined_at: new Date().toISOString()
				}));
				
				// 재접속한 경우도 위치 공유 시작
				setTimeout(() => startLocationTracking(), 1000); // 약간의 딩레이
			} else {
				// Add new user to participants with heartbeat
				const now = new Date().toISOString();
				const { data, error } = await supabase
					.from('participants')
					.insert({
						room_id: roomId,
						name: displayName,
						is_creator: isCreator,
						last_heartbeat: now
					})
					.select()
					.single();

				if (error) {
					console.error('Error joining room:', error);
				} else {
					currentUserId = data.id;
					console.log(`Joined room ${roomId} as ${displayName} (new participant)`);
					
					// Store user session in localStorage first
					localStorage.setItem(`room_${roomId}_user`, JSON.stringify({
						id: currentUserId,
						name: displayName,
						joined_at: new Date().toISOString()
					}));
					
					// 새로 참여한 경우 위치 공유 시작
					setTimeout(() => startLocationTracking(), 1000); // 약간의 딩레이
				}
			}

			// localStorage 설정은 위에서 처리됨
		}
	}

	// 취소 버튼용 leaveRoom 함수 (참여 전에만 사용)
	async function leaveRoom() {
		goto('/');
	}

	async function sendMessage() {
		if (newMessage.trim()) {
			if (!supabase) {
				console.log('Sending message:', newMessage, '(demo mode)');
				messages = [...messages, {
					sender: displayName,
					content: newMessage,
					created_at: new Date().toISOString()
				}];
				newMessage = '';
				return;
			}

			const { error } = await supabase
				.from('messages')
				.insert({
					room_id: roomId,
					sender: displayName,
					content: newMessage
				});

			if (error) {
				console.error('Error sending message:', error);
			} else {
				newMessage = '';
			}
		}
	}

	// 위치 업데이트 함수
	async function updateLocationInDatabase(lat, lng) {
		if (!supabase || !currentUserId) {
			console.log('Location updated:', { lat, lng }, '(demo mode)');
			return;
		}

		const { error } = await supabase
			.from('participants')
			.update({
				location_lat: lat,
				location_lng: lng,
				updated_at: new Date().toISOString()
			})
			.eq('id', currentUserId);

		if (error) {
			console.error('Error updating location:', error);
		} else {
			console.log('실시간 위치 업데이트됨:', { lat, lng });
		}
	}

	// 위치 공유 및 실시간 추적 시작
	async function startLocationTracking() {
		if (!navigator.geolocation) {
			console.warn('이 브라우저는 위치 서비스를 지원하지 않습니다.');
			return;
		}

		if (isLocationTracking) {
			console.log('이미 위치 추적 중입니다.');
			return;
		}

		try {
			// 먼저 한 번 위치 가져오기
			await getCurrentLocationOnce();
			
			// 그 다음 실시간 추적 시작
			startContinuousTracking();
		} catch (error) {
			console.error('위치 추적 시작 실패:', error);
		}
	}

	// 한 번만 위치 가져오기
	function getCurrentLocationOnce() {
		return new Promise((resolve, reject) => {
			navigator.geolocation.getCurrentPosition(
				async (position) => {
					userLocation = {
						lat: position.coords.latitude,
						lng: position.coords.longitude
					};
					await updateLocationInDatabase(userLocation.lat, userLocation.lng);
					console.log('초기 위치 공유 완룈:', userLocation);
					
					// 위치 업데이트 후 참에자 목록 새로고침
					if (supabase) {
						await loadRoomData();
					}
					
					resolve(userLocation);
				},
				(error) => {
					console.error('위치 가져오기 실패:', error);
					reject(error);
				},
				{
					enableHighAccuracy: true,
					timeout: 15000,
					maximumAge: 60000
				}
			);
		});
	}

	// 실시간 위치 추적 시작
	function startContinuousTracking() {
		if (isLocationTracking) {
			console.log('이미 실시간 추적 중입니다.');
			return;
		}

		watchId = navigator.geolocation.watchPosition(
			async (position) => {
				const newLocation = {
					lat: position.coords.latitude,
					lng: position.coords.longitude
				};
				
				// 위치가 변경되었는지 확인 (최소 10m 이상 이동시에만 업데이트)
				if (!userLocation || 
					calculateDistance(userLocation, newLocation) > 0.01) { // 10m
					userLocation = newLocation;
					await updateLocationInDatabase(newLocation.lat, newLocation.lng);
					
					// 위치 업데이트 후 참에자 목록 새로고침
					if (supabase) {
						await loadRoomData();
					}
				}
			},
			(error) => {
				console.error('실시간 위치 추적 오류:', error);
				stopLocationTracking();
			},
			{
				enableHighAccuracy: true,
				timeout: 15000,
				maximumAge: 30000
			}
		);
		isLocationTracking = true;
		console.log('실시간 위치 추적 시작');
	}

	// 실시간 위치 추적 중지
	function stopLocationTracking() {
		if (watchId !== null) {
			navigator.geolocation.clearWatch(watchId);
			watchId = null;
		}
		isLocationTracking = false;
		console.log('실시간 위치 추적 중지');
	}

	// 브라우저 창 닫기 전 처리
	function handleBeforeUnload(event) {
		if (supabase && currentUserId && joined) {
			try {
				// Supabase를 사용하여 동기식으로 참여자 제거
				// 브라우저가 닫히기 전에 실행되도록 XMLHttpRequest를 동기식으로 사용
				const xhr = new XMLHttpRequest();
				xhr.open('DELETE', `https://spzpfvcjjjmlqltdbitg.supabase.co/rest/v1/participants?id=eq.${currentUserId}`, false); // 동기식
				xhr.setRequestHeader('apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNwenBmdmNqamptbHFsdGRiaXRnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTEyNjc3OTgsImV4cCI6MjA2Njg0Mzc5OH0.GNGIjdzloulRxa1OUJfMrUdjL_fnGsTLxs6lqSeutyU');
				xhr.setRequestHeader('Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNwenBmdmNqamptbHFsdGRiaXRnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTEyNjc3OTgsImV4cCI6MjA2Njg0Mzc5OH0.GNGIjdzloulRxa1OUJfMrUdjL_fnGsTLxs6lqSeutyU');
				xhr.send();
			} catch (error) {
				console.error('참여자 제거 오류:', error);
			}
		}
		
		// localStorage 정리
		localStorage.removeItem(`room_${roomId}_user`);
	}

	// 페이지 숨김 처리 (모바일 지원)
	function handlePageHide(event) {
		// 모바일에서는 sendBeacon 사용
		if (supabase && currentUserId && joined) {
			try {
				// sendBeacon으로 안정적으로 요청 전송
				const url = `https://spzpfvcjjjmlqltdbitg.supabase.co/rest/v1/participants?id=eq.${currentUserId}`;
				const headers = {
					'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNwenBmdmNqamptbHFsdGRiaXRnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTEyNjc3OTgsImV4cCI6MjA2Njg0Mzc5OH0.GNGIjdzloulRxa1OUJfMrUdjL_fnGsTLxs6lqSeutyU',
					'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNwenBmdmNqamptbHFsdGRiaXRnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTEyNjc3OTgsImV4cCI6MjA2Njg0Mzc5OH0.GNGIjdzloulRxa1OUJfMrUdjL_fnGsTLxs6lqSeutyU'
				};
				
				// Fetch API를 사용하여 DELETE 요청
				fetch(url, {
					method: 'DELETE',
					headers: headers,
					keepalive: true  // 페이지가 닫혀도 요청 유지
				}).catch(console.error);
			} catch (error) {
				console.error('참여자 제거 오류:', error);
			}
		}
		
		localStorage.removeItem(`room_${roomId}_user`);
	}

	// 룸 나가기 정리 함수
	async function leaveRoomCleanup() {
		if (!supabase || !currentUserId) return;

		try {
			// Presence tracking 중지
			if (presenceChannel) {
				await presenceChannel.untrack();
			}

			// 참에자 데이터베이스에서 제거
			await supabase
				.from('participants')
				.delete()
				.eq('id', currentUserId);
			
			console.log('참에자 정리 완료:', currentUserId);
		} catch (error) {
			console.error('참에자 정리 오류:', error);
		}
	}

	// 수동 나가기 함수
	async function leaveRoomManually() {
		await leaveRoomCleanup();
		
		// Clear user session from localStorage
		localStorage.removeItem(`room_${roomId}_user`);
		
		goto('/');
	}

	function openDestinationSearch() {
		console.log('=== 목적지 검색 시작 ===');
		console.log('isCreator:', isCreator);
		console.log('currentUserId:', currentUserId);
		console.log('displayName:', displayName);
		
		if (!isCreator) {
			alert('목적지 검색은 방장만 가능합니다.');
			return;
		}
		
		showDestinationSearch = true;
		searchQuery = '';
		searchResults = [];
		console.log('목적지 검색 모달 열림');
	}

</script>

<svelte:head>
	<title>오디야 - 룸 {roomId}</title>
</svelte:head>

<main class="min-h-screen bg-slate-50 dark:bg-slate-900">
	{#if !joined}
		<!-- Join Room Modal -->
		<div class="min-h-screen flex items-center justify-center px-4">
			<div class="bg-white dark:bg-slate-800 rounded-lg shadow-lg p-8 w-full max-w-md">
				<div class="text-center space-y-6">
					<div>
						<h1 class="text-2xl font-bold text-slate-900 dark:text-slate-100">
							룸 참여하기
						</h1>
						<p class="text-slate-600 dark:text-slate-400 mt-2">
							룸 ID: <span class="font-mono text-sm bg-slate-100 dark:bg-slate-700 px-2 py-1 rounded">{roomId}</span>
						</p>
					</div>
					
					<div class="space-y-4">
						<div>
							<label for="displayName" class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
								대화명을 입력하세요
							</label>
							<input
								id="displayName"
								type="text"
								bind:value={displayName}
								placeholder="홍길동"
								class="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-slate-500 focus:border-transparent"
								on:keypress={(e) => e.key === 'Enter' && joinRoom()}
							/>
						</div>
						
						<div class="flex gap-3">
							<Button 
								variant="outline" 
								class="flex-1"
								disabled={false}
								onclick={leaveRoom}
							>
								취소
							</Button>
							<Button 
								class="flex-1"
								disabled={!displayName.trim()}
								onclick={joinRoom}
							>
								참여하기
							</Button>
						</div>
					</div>
				</div>
			</div>
		</div>
	{:else}
		<!-- Room Interface -->
		<div class="flex flex-col h-screen">
			<!-- Header -->
			<header class="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 p-4">
				<div class="flex items-center justify-between">
					<div>
						<h1 class="text-xl font-semibold text-slate-900 dark:text-slate-100">
							오디야
						</h1>
					</div>
					<div class="flex gap-2">
						<div class="flex items-center gap-2 px-3 py-1.5 bg-green-50 dark:bg-green-900/20 rounded-lg">
							<div class="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
							<span class="text-sm text-green-700 dark:text-green-300 font-medium">
								{isLocationTracking ? '위치 공유 중' : '위치 공유 준비 중'}
							</span>
						</div>
						{#if isCreator}
							<Button 
								variant="outline" 
								size="sm"
								class=""
								disabled={false}
								onclick={openDestinationSearch}
							>
								목적지 검색
							</Button>
						{/if}
					</div>
				</div>
			</header>

			<!-- Map Panel (Full Screen) -->
			<div class="flex-1 relative">
				<KakaoMap {participants} {destination} {isCreator} />
			</div>

			<!-- Floating Participants Panel -->
			<div class="fixed top-16 left-0 z-40 bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 shadow-lg transition-transform duration-300 ease-in-out {participantsExpanded ? 'translate-x-0' : 'translate-x-[-280px]'}">
				<!-- Participants Toggle Button -->
				<button 
					class="absolute -right-12 top-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-r-lg p-3 cursor-pointer shadow-lg"
					on:click={() => participantsExpanded = !participantsExpanded}
					aria-label="참여자 패널 토글"
				>
					<div class="flex flex-col items-center gap-1">
						<div class="w-6 h-6 text-slate-600 dark:text-slate-400 transition-transform duration-200 {participantsExpanded ? 'rotate-180' : ''}">
							<svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
							</svg>
						</div>
						<span class="text-xs text-slate-600 dark:text-slate-400 font-medium">
							{participants.length}
						</span>
					</div>
				</button>

				<!-- Participants Content -->
				<div class="w-80 h-[calc(100vh-80px)] p-4 overflow-y-auto">
					<div class="space-y-4">
						<div>
							<h2 class="text-lg font-medium text-slate-900 dark:text-slate-100 mb-3">
								참여자 ({participants.length})
							</h2>
							<div class="space-y-2">
								<!-- All participants -->
								{#each participants as participant (participant.id)}
									<div class="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-700 rounded-lg">
										<div>
											<span class="font-medium text-slate-900 dark:text-slate-100">
												{participant.name} {participant.is_creator ? '(방장)' : ''} {participant.id === currentUserId ? '(나)' : ''}
											</span>
											{#if participant.location_lat && participant.location_lng}
												<p class="text-xs text-green-600 dark:text-green-400">
													📍 위치 공유중
												</p>
											{:else}
												<p class="text-xs text-slate-500">위치 공유 준비중</p>
											{/if}
										</div>
										{#if destination && participant.location_lat && participant.location_lng}
											<span class="text-sm text-slate-600 dark:text-slate-400">
												{calculateDistance({lat: destination.lat, lng: destination.lng}, {lat: participant.location_lat, lng: participant.location_lng}).toFixed(1)}km
											</span>
										{/if}
									</div>
								{/each}
							</div>
						</div>

						{#if destination}
							<div class="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
								<h3 class="text-sm font-medium text-blue-900 dark:text-blue-100 mb-1">
									🎯 목적지
								</h3>
								{#if destination.name}
									<p class="text-sm font-medium text-blue-800 dark:text-blue-200">
										{destination.name}
									</p>
								{/if}
								{#if destination.address}
									<p class="text-xs text-blue-700 dark:text-blue-300 mt-1">
										{destination.address}
									</p>
								{:else}
									<p class="text-xs text-blue-700 dark:text-blue-300">
										위도: {destination.lat.toFixed(6)}<br>
										경도: {destination.lng.toFixed(6)}
									</p>
								{/if}
							</div>
							{#if isCreator && destination}
								<!-- 목적지 제거 버튼 (방장만) -->
								<div class="mt-3">
									<Button 
										variant="outline" 
										size="sm"
										class="w-full text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
										onclick={removeDestination}
									>
										🗑️ 목적지 제거
									</Button>
								</div>
							{/if}
						{/if}
						
						<!-- 나가기 버튼 -->
						<div class="mt-6 pt-4 border-t border-slate-200 dark:border-slate-700">
							<Button 
								variant="destructive" 
								size="sm"
								class="w-full"
								onclick={leaveRoomManually}
							>
								🚶 룸 나가기
							</Button>
						</div>
					</div>
				</div>
			</div>

			<!-- Fixed Chat Panel -->
			<div class="fixed bottom-2 right-2 sm:bottom-4 sm:right-4 z-50 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl transition-all duration-300 ease-in-out {chatExpanded ? 'w-full max-w-[90vw] sm:w-96 h-96' : 'w-full max-w-[90vw] sm:w-72 h-12'}">
				<!-- Chat Header (Always Visible) -->
				<button 
					class="w-full p-3 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700 cursor-pointer flex items-center justify-between rounded-t-lg"
					on:click={() => chatExpanded = !chatExpanded}
					aria-label="채팅창 토글"
				>
					<div class="flex items-center gap-2">
						<div class="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
						<span class="text-sm font-medium text-slate-900 dark:text-slate-100">
							채팅 ({messages.length})
						</span>
					</div>
					<div class="transform transition-transform duration-200 {chatExpanded ? 'rotate-180' : ''}">
						<svg class="w-5 h-5 text-slate-600 dark:text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
						</svg>
					</div>
				</button>

				<!-- Chat Content (Expandable) -->
				{#if chatExpanded}
					<div class="h-80">
						<!-- Messages -->
						<div class="h-60 p-4 overflow-y-auto bg-slate-25 dark:bg-slate-900/50">
							<div class="space-y-3">
								{#each messages as message, index (index)}
									<div class="flex">
										<div class="bg-white dark:bg-slate-800 rounded-lg p-3 max-w-[calc(100%-2rem)] sm:max-w-xs shadow-sm">
											<p class="text-sm font-medium text-slate-900 dark:text-slate-100">
												{message.sender}
											</p>
											<p class="text-slate-700 dark:text-slate-300 mt-1">
												{message.content}
											</p>
										</div>
									</div>
								{/each}
							</div>
						</div>

						<!-- Message Input -->
						<div class="h-20 p-4 bg-white dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 rounded-b-lg">
							<div class="flex gap-2">
								<input
									type="text"
									bind:value={newMessage}
									placeholder="메시지를 입력하세요..."
									class="flex-1 px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-slate-500 focus:border-transparent"
									on:keypress={(e) => e.key === 'Enter' && sendMessage()}
								/>
								<Button 
									size="sm" 
									class=""
									onclick={sendMessage} 
									disabled={!newMessage.trim()}
								>
									전송
								</Button>
							</div>
						</div>
					</div>
				{/if}
			</div>

			<!-- Destination Search Modal -->
			{#if showDestinationSearch}
				<div class="fixed inset-0 bg-opacity-10 backdrop-blur-sm flex items-center justify-center z-60">
					<div class="bg-white dark:bg-slate-800 rounded-lg shadow-xl w-full max-w-md mx-4 max-h-[80vh] flex flex-col">
						<!-- Search Header -->
						<div class="p-4 border-b border-slate-200 dark:border-slate-700">
							<div class="flex items-center justify-between mb-3">
								<h3 class="text-lg font-semibold text-slate-900 dark:text-slate-100">
									목적지 검색
								</h3>
								<button 
									class="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
									on:click={() => showDestinationSearch = false}
									aria-label="검색창 닫기"
								>
									<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
									</svg>
								</button>
							</div>
							
							<!-- Search Input -->
							<div class="relative">
								<input
									type="text"
									bind:value={searchQuery}
									placeholder="장소명이나 주소를 입력하세요"
									class="w-full px-4 py-2 pr-10 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
									autocomplete="off"
								/>
								{#if isSearching}
									<div class="absolute right-3 top-1/2 transform -translate-y-1/2">
										<div class="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
									</div>
								{:else}
									<div class="absolute right-3 top-1/2 transform -translate-y-1/2">
										<svg class="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
										</svg>
									</div>
								{/if}
							</div>
						</div>

						<!-- Search Results -->
						<div class="flex-1 overflow-y-auto">
							{#if searchResults.length > 0}
								<div class="p-2">
									{#each searchResults as place (place.id)}
										<button
											class="w-full p-3 text-left hover:bg-slate-50 dark:hover:bg-slate-700 rounded-lg transition-colors border-b border-slate-100 dark:border-slate-700 last:border-b-0"
											on:click={() => moveToLocation(place)}
										>
											<div class="flex items-start gap-3">
												<div class="flex-shrink-0 w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center">
													<svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
														<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path>
														<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path>
													</svg>
												</div>
												<div class="flex-1 min-w-0">
													<h4 class="font-medium text-slate-900 dark:text-slate-100 truncate">
														{place.name}
													</h4>
													<p class="text-sm text-slate-600 dark:text-slate-400 truncate">
														{place.roadAddress || place.address}
													</p>
													{#if place.category}
														<p class="text-xs text-blue-600 dark:text-blue-400 mt-1">
															{place.category}
														</p>
													{/if}
												</div>
											</div>
										</button>
									{/each}
								</div>
							{:else if searchQuery.length > 1 && !isSearching}
								<div class="p-8 text-center text-slate-500 dark:text-slate-400">
									<svg class="w-12 h-12 mx-auto mb-3 text-slate-300 dark:text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
									</svg>
									<p>검색 결과가 없습니다</p>
									<p class="text-sm mt-1">다른 키워드로 검색해보세요</p>
								</div>
							{:else if searchQuery.length === 0}
								<div class="p-8 text-center text-slate-500 dark:text-slate-400">
									<svg class="w-12 h-12 mx-auto mb-3 text-slate-300 dark:text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path>
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path>
									</svg>
									<p>장소나 주소를 검색하세요</p>
									<p class="text-sm mt-1">예: 강남역, 롯데타워, 서울시청</p>
								</div>
							{/if}
						</div>
					</div>
				</div>
			{/if}

			<!-- Destination Confirmation Dialog -->
			{#if showDestinationConfirm && pendingDestination}
				<div class="fixed inset-0 flex items-center justify-center z-70">
					<div class="bg-white dark:bg-slate-800 rounded-lg shadow-xl w-full max-w-sm mx-4 p-6">
						<div class="text-center space-y-4">
							<div class="w-16 h-16 bg-green-100 dark:bg-green-900/20 rounded-full flex items-center justify-center mx-auto">
								<svg class="w-8 h-8 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path>
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path>
								</svg>
							</div>
							
							<div>
								<h3 class="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">
									목적지로 설정하시겠습니까?
								</h3>
								{#if pendingDestination.name && pendingDestination.name !== '선택한 위치'}
									<p class="text-sm font-medium text-slate-900 dark:text-slate-100">
										{pendingDestination.name}
									</p>
								{/if}
								{#if pendingDestination.address}
									<p class="text-xs text-slate-600 dark:text-slate-400 mt-1">
										{pendingDestination.address}
									</p>
								{:else}
									<p class="text-xs text-slate-600 dark:text-slate-400 mt-1">
										위도: {pendingDestination.lat.toFixed(6)}<br>
										경도: {pendingDestination.lng.toFixed(6)}
									</p>
								{/if}
							</div>
							
							<div class="flex gap-3">
								<Button 
									variant="outline" 
									class="flex-1"
									onclick={cancelDestination}
								>
									취소
								</Button>
								<Button 
									class="flex-1"
									onclick={confirmDestination}
								>
									목적지 설정
								</Button>
							</div>
						</div>
					</div>
				</div>
			{/if}
		</div>
	{/if}
</main>