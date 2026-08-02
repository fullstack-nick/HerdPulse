import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { createClient } from 'graphql-ws';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

const apiUrl =
  process.env.EXPO_PUBLIC_API_URL ||
  (Platform.OS === 'android' ? 'http://10.0.2.2:4000/graphql' : 'http://localhost:4000/graphql');
const subscriptionUrl = apiUrl.replace(/^http/, 'ws');
const organizationId = 'org-demo-farm';
const token = 'demo-worker';

interface Task {
  id: string;
  title: string;
  instructions: string;
  status: string;
  dueAt: string;
  isOverdue: boolean;
  version: number;
  assigneeName?: string;
  animalId: string;
  animalName: string;
  caseId: string;
  priority: string;
  comments: { id: string; body: string; authorName: string; createdAt: string }[];
}
interface HealthCase {
  id: string;
  status: string;
  priority: string;
  score: number;
  version: number;
  updatedAt: string;
  animal: {
    id: string;
    displayName: string;
    officialId: string;
    lactationPhase: string;
    group?: { name: string };
    device?: { status: string };
  };
  riskAssessment?: { reasons: { code: string; points: number }[] };
  tasks: Task[];
}
interface Animal {
  id: string;
  displayName: string;
  officialId: string;
  lactationPhase: string;
  group?: { name: string };
  device?: { status: string; batteryPercent?: number };
  activeCase?: { id: string; priority: string; score: number };
}
type Tab = 'today' | 'alerts' | 'animals';
type Detail =
  | { type: 'task'; item: Task }
  | { type: 'case'; item: HealthCase }
  | { type: 'animal'; item: Animal };

async function gql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ query, variables }),
  });
  const body = await response.json();
  if (!response.ok || body.errors?.length)
    throw new Error(body.errors?.[0]?.message || 'Request failed');
  return body.data;
}

const TASKS = `query MobileTasks($organizationId: ID!) { tasks(organizationId: $organizationId) { id title instructions status dueAt isOverdue version assigneeName animalId animalName caseId priority comments { id body authorName createdAt } } }`;
const CASES = `query MobileCases($organizationId: ID!) { healthCases(organizationId: $organizationId) { id status priority score version updatedAt animal { id displayName officialId lactationPhase group { name } device { status } } riskAssessment { reasons { code points } } tasks { id title instructions status dueAt isOverdue version assigneeName animalId animalName caseId priority comments { id body authorName createdAt } } } }`;
const ANIMALS = `query MobileAnimals($organizationId: ID!) { animals(organizationId: $organizationId) { id displayName officialId lactationPhase group { name } device { status batteryPercent } activeCase { id priority score } } }`;
const CLAIM = `mutation Claim($organizationId: ID!, $id: ID!, $version: Int!) { claimTask(organizationId: $organizationId, id: $id, expectedVersion: $version) { ok message } }`;
const COMPLETE = `mutation Complete($organizationId: ID!, $id: ID!, $version: Int!, $resolution: String!) { completeTask(organizationId: $organizationId, id: $id, expectedVersion: $version, resolution: $resolution) { ok message } }`;
const COMMENT = `mutation Comment($organizationId: ID!, $taskId: ID!, $body: String!) { addTaskComment(organizationId: $organizationId, taskId: $taskId, body: $body) { ok message } }`;

function PulseMark() {
  return (
    <View style={styles.pulseMark}>
      <Ionicons name="pulse" size={20} color="#173f36" />
    </View>
  );
}
function Priority({ value }: { value: string }) {
  const color = value === 'HIGH' ? '#b94735' : value === 'MEDIUM' ? '#9b6a26' : '#3d7566';
  return (
    <View style={[styles.priority, { backgroundColor: `${color}18` }]}>
      <View style={[styles.priorityDot, { backgroundColor: color }]} />
      <Text style={[styles.priorityText, { color }]}>{value}</Text>
    </View>
  );
}
function Avatar({ name, large = false }: { name: string; large?: boolean }) {
  return (
    <View style={[styles.avatar, large && styles.avatarLarge]}>
      <Text style={[styles.avatarText, large && styles.avatarTextLarge]}>{name.slice(0, 1)}</Text>
    </View>
  );
}

export default function App() {
  const [tab, setTab] = useState<Tab>('today');
  const [detail, setDetail] = useState<Detail>();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [cases, setCases] = useState<HealthCase[]>([]);
  const [animals, setAnimals] = useState<Animal[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const detailKey = detail ? `${detail.type}:${detail.item.id}` : '';
  const load = useCallback(async () => {
    try {
      const [taskData, caseData, animalData] = await Promise.all([
        gql<{ tasks: Task[] }>(TASKS, { organizationId }),
        gql<{ healthCases: HealthCase[] }>(CASES, { organizationId }),
        gql<{ animals: Animal[] }>(ANIMALS, { organizationId }),
      ]);
      setTasks(taskData.tasks);
      setCases(caseData.healthCases);
      setAnimals(animalData.animals);
      setError('');
      if (detail?.type === 'task') {
        const fresh = taskData.tasks.find((item) => item.id === detail.item.id);
        if (fresh) setDetail({ type: 'task', item: fresh });
      } else if (detail?.type === 'case') {
        const fresh = caseData.healthCases.find((item) => item.id === detail.item.id);
        if (fresh) setDetail({ type: 'case', item: fresh });
      } else if (detail?.type === 'animal') {
        const fresh = animalData.animals.find((item) => item.id === detail.item.id);
        if (fresh) setDetail({ type: 'animal', item: fresh });
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [detailKey]);
  useEffect(() => {
    void load();
    const timer = setInterval(load, 15_000);
    return () => clearInterval(timer);
  }, [load]);
  useEffect(() => {
    const client = createClient({
      url: subscriptionUrl,
      connectionParams: { authorization: `Bearer ${token}` },
      retryAttempts: Infinity,
    });
    const subscriptions = ['healthCaseChanged', 'taskChanged', 'deviceStatusChanged'].map((field) =>
      client.subscribe(
        {
          query: `subscription Live($organizationId: ID!) { ${field}(organizationId: $organizationId) { entityId changeType } }`,
          variables: { organizationId },
        },
        {
          next: () => void load(),
          error: () => undefined,
          complete: () => undefined,
        },
      ),
    );
    return () => {
      subscriptions.forEach((dispose) => dispose());
      void client.dispose();
    };
  }, [load]);
  if (loading)
    return (
      <SafeAreaProvider>
        <View style={styles.loading}>
          <PulseMark />
          <ActivityIndicator color="#2b705e" />
          <Text>Connecting to HerdPulse…</Text>
        </View>
      </SafeAreaProvider>
    );
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <SafeAreaView style={styles.safe} edges={['top']}>
        {detail ? (
          <DetailScreen detail={detail} back={() => setDetail(undefined)} reload={load} />
        ) : (
          <>
            <View style={styles.header}>
              <View style={styles.brand}>
                <PulseMark />
                <Text style={styles.brandText}>
                  Herd<Text style={styles.brandAccent}>Pulse</Text>
                </Text>
              </View>
              <View style={styles.headerRight}>
                <View style={styles.live}>
                  <View style={styles.liveDot} />
                  <Text style={styles.liveText}>LIVE</Text>
                </View>
                <View style={styles.user}>
                  <Text style={styles.userText}>J</Text>
                </View>
              </View>
            </View>
            {error ? (
              <View style={styles.error}>
                <Ionicons name="cloud-offline-outline" size={18} color="#a94938" />
                <View>
                  <Text style={styles.errorTitle}>Local API unavailable</Text>
                  <Text style={styles.errorCopy}>{error}</Text>
                  <Text style={styles.errorUrl}>{apiUrl}</Text>
                </View>
              </View>
            ) : null}
            <ScrollView
              style={styles.content}
              contentContainerStyle={styles.contentInner}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={() => {
                    setRefreshing(true);
                    void load();
                  }}
                  tintColor="#2b705e"
                />
              }
            >
              {tab === 'today' && <Today tasks={tasks} cases={cases} open={setDetail} />}
              {tab === 'alerts' && <Alerts cases={cases} open={setDetail} />}
              {tab === 'animals' && <Animals animals={animals} open={setDetail} />}
            </ScrollView>
            <View style={styles.tabs}>
              {(
                [
                  ['today', 'Today', 'today-outline'],
                  ['alerts', 'Alerts', 'notifications-outline'],
                  ['animals', 'Animals', 'paw-outline'],
                ] as const
              ).map(([key, label, icon]) => (
                <Pressable key={key} style={styles.tab} onPress={() => setTab(key)}>
                  <View>
                    {key === 'alerts' &&
                      cases.filter((item) => item.status !== 'RESOLVED').length > 0 && (
                        <View style={styles.tabBadge}>
                          <Text style={styles.tabBadgeText}>
                            {cases.filter((item) => item.status !== 'RESOLVED').length}
                          </Text>
                        </View>
                      )}
                    <Ionicons name={icon} size={23} color={tab === key ? '#174b3e' : '#89938f'} />
                  </View>
                  <Text style={[styles.tabText, tab === key && styles.tabTextActive]}>{label}</Text>
                </Pressable>
              ))}
            </View>
          </>
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

function Today({
  tasks,
  cases,
  open,
}: {
  tasks: Task[];
  cases: HealthCase[];
  open: (detail: Detail) => void;
}) {
  const activeTasks = tasks.filter((item) => item.status !== 'COMPLETED');
  const high = cases.filter(
    (item) => item.status !== 'RESOLVED' && item.priority === 'HIGH',
  ).length;
  return (
    <>
      <View style={styles.eyebrowRow}>
        <View style={styles.liveDot} />
        <Text style={styles.eyebrow}>CONNECTED WORK QUEUE</Text>
      </View>
      <Text style={styles.title}>Good morning, Jon</Text>
      <Text style={styles.subtitle}>Focus on the animals that need you now.</Text>
      <View style={styles.stats}>
        <View style={[styles.stat, styles.statUrgent]}>
          <Text style={styles.statLabel}>HIGH PRIORITY</Text>
          <Text style={styles.statValue}>{high}</Text>
          <Text style={styles.statFoot}>
            of {cases.filter((item) => item.status !== 'RESOLVED').length} active
          </Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statLabel}>MY OPEN TASKS</Text>
          <Text style={styles.statValue}>
            {activeTasks.filter((item) => item.assigneeName === 'Jon Bell').length}
          </Text>
          <Text style={styles.statFoot}>
            {activeTasks.filter((item) => item.isOverdue).length} overdue
          </Text>
        </View>
      </View>
      <SectionTitle title="Next work" count={activeTasks.length} />
      {activeTasks.slice(0, 8).map((task) => (
        <TaskRow key={task.id} task={task} onPress={() => open({ type: 'task', item: task })} />
      ))}
      {!activeTasks.length && (
        <Empty
          icon="checkmark-circle-outline"
          title="Queue complete"
          copy="New work appears when health signals cross a threshold."
        />
      )}
    </>
  );
}
function Alerts({ cases, open }: { cases: HealthCase[]; open: (detail: Detail) => void }) {
  const active = cases.filter((item) => item.status !== 'RESOLVED');
  return (
    <>
      <Text style={styles.pageKicker}>TRIAGE QUEUE</Text>
      <Text style={styles.title}>Health alerts</Text>
      <Text style={styles.subtitle}>Prioritized with transparent risk reasons.</Text>
      <View style={styles.filterPill}>
        <Text style={styles.filterPillActive}>Active {active.length}</Text>
        <Text style={styles.filterPillText}>All {cases.length}</Text>
      </View>
      {active.map((item) => (
        <Pressable
          key={item.id}
          style={styles.caseCard}
          onPress={() => open({ type: 'case', item })}
        >
          <View
            style={[
              styles.caseStripe,
              { backgroundColor: item.priority === 'HIGH' ? '#c5513c' : '#c28b34' },
            ]}
          />
          <Avatar name={item.animal.displayName} />
          <View style={styles.rowCopy}>
            <Text style={styles.rowTitle}>{item.animal.displayName}</Text>
            <Text style={styles.rowMeta}>
              {item.animal.officialId} · {item.animal.group?.name}
            </Text>
          </View>
          <View style={styles.caseScore}>
            <Text style={styles.caseScoreLabel}>RISK</Text>
            <Text style={styles.caseScoreValue}>{item.score}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#a3aaa6" />
        </Pressable>
      ))}
      {!active.length && (
        <Empty
          icon="shield-checkmark-outline"
          title="Herd is clear"
          copy="There are no active cases right now."
        />
      )}
    </>
  );
}
function Animals({ animals, open }: { animals: Animal[]; open: (detail: Detail) => void }) {
  const [search, setSearch] = useState('');
  const visible = animals.filter((item) =>
    `${item.displayName} ${item.officialId}`.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <>
      <Text style={styles.pageKicker}>HERD DIRECTORY</Text>
      <Text style={styles.title}>Animals</Text>
      <Text style={styles.subtitle}>Health state and device context at a glance.</Text>
      <View style={styles.search}>
        <Ionicons name="search-outline" size={19} color="#77847e" />
        <TextInput
          value={search}
          onChangeText={setSearch}
          style={styles.searchInput}
          placeholder="Search name or official ID"
          placeholderTextColor="#9aa39f"
        />
      </View>
      {visible.map((item) => (
        <Pressable
          key={item.id}
          style={styles.animalRow}
          onPress={() => open({ type: 'animal', item })}
        >
          <Avatar name={item.displayName} />
          <View style={styles.rowCopy}>
            <Text style={styles.rowTitle}>{item.displayName}</Text>
            <Text style={styles.rowMeta}>
              {item.officialId} · {item.group?.name}
            </Text>
          </View>
          {item.activeCase ? (
            <Priority value={item.activeCase.priority} />
          ) : (
            <View style={styles.clear}>
              <Text style={styles.clearText}>CLEAR</Text>
            </View>
          )}
          <Ionicons name="chevron-forward" size={17} color="#a3aaa6" />
        </Pressable>
      ))}
    </>
  );
}

function SectionTitle({ title, count }: { title: string; count: number }) {
  return (
    <View style={styles.sectionTitle}>
      <Text style={styles.sectionTitleText}>{title}</Text>
      <View style={styles.count}>
        <Text style={styles.countText}>{count}</Text>
      </View>
    </View>
  );
}
function TaskRow({ task, onPress }: { task: Task; onPress: () => void }) {
  return (
    <Pressable style={styles.taskCard} onPress={onPress}>
      <View style={[styles.taskIcon, task.isOverdue && styles.taskIconUrgent]}>
        <Ionicons
          name={task.isOverdue ? 'alert' : 'clipboard-outline'}
          size={18}
          color={task.isOverdue ? '#b74936' : '#477568'}
        />
      </View>
      <View style={styles.rowCopy}>
        <View style={styles.rowTop}>
          <Priority value={task.priority} />
          <Text style={[styles.due, task.isOverdue && styles.dueUrgent]}>
            {task.isOverdue
              ? 'OVERDUE'
              : new Date(task.dueAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </Text>
        </View>
        <Text style={styles.taskTitle}>{task.title}</Text>
        <Text style={styles.rowMeta}>
          {task.animalName} · {task.assigneeName || 'Unassigned'}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color="#a3aaa6" />
    </Pressable>
  );
}
function Empty({
  icon,
  title,
  copy,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  copy: string;
}) {
  return (
    <View style={styles.empty}>
      <Ionicons name={icon} size={35} color="#5b8d7b" />
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyCopy}>{copy}</Text>
    </View>
  );
}

function DetailScreen({
  detail,
  back,
  reload,
}: {
  detail: Detail;
  back: () => void;
  reload: () => Promise<void>;
}) {
  if (detail.type === 'task') return <TaskDetail item={detail.item} back={back} reload={reload} />;
  if (detail.type === 'case') return <CaseDetail item={detail.item} back={back} />;
  return <AnimalDetail item={detail.item} back={back} />;
}
function DetailHeader({ title, back }: { title: string; back: () => void }) {
  return (
    <View style={styles.detailHeader}>
      <Pressable style={styles.back} onPress={back}>
        <Ionicons name="arrow-back" size={21} color="#28473f" />
      </Pressable>
      <Text style={styles.detailHeaderTitle}>{title}</Text>
      <View style={styles.backSpacer} />
    </View>
  );
}
function TaskDetail({
  item,
  back,
  reload,
}: {
  item: Task;
  back: () => void;
  reload: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [comment, setComment] = useState('');
  async function act(query: string, variables: Record<string, unknown>, message: string) {
    setBusy(true);
    try {
      await gql(query, { organizationId, ...variables });
      Alert.alert('Updated', message);
      await reload();
    } catch (error) {
      Alert.alert('Could not update', error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <View style={styles.detailScreen}>
      <DetailHeader title="Task" back={back} />
      <ScrollView contentContainerStyle={styles.detailBody}>
        <View style={styles.detailHero}>
          <Priority value={item.priority} />
          <Text style={styles.detailTitle}>{item.title}</Text>
          <Text style={styles.detailAnimal}>{item.animalName}</Text>
          <View style={styles.dueRow}>
            <Ionicons
              name="time-outline"
              size={16}
              color={item.isOverdue ? '#bd4d39' : '#68766f'}
            />
            <Text style={[styles.detailDue, item.isOverdue && styles.dueUrgent]}>
              {item.isOverdue ? 'Overdue · ' : 'Due · '}
              {new Date(item.dueAt).toLocaleString()}
            </Text>
          </View>
        </View>
        <View style={styles.whiteCard}>
          <Text style={styles.cardLabel}>FIELD INSTRUCTIONS</Text>
          <Text style={styles.instructions}>{item.instructions}</Text>
        </View>
        <View style={styles.whiteCard}>
          <Text style={styles.cardLabel}>FIELD NOTES</Text>
          {item.comments.map((entry) => (
            <View style={styles.note} key={entry.id}>
              <View style={styles.noteAvatar}>
                <Text style={styles.noteAvatarText}>{entry.authorName.slice(0, 1)}</Text>
              </View>
              <View style={styles.noteCopy}>
                <Text style={styles.noteAuthor}>{entry.authorName}</Text>
                <Text style={styles.noteBody}>{entry.body}</Text>
              </View>
            </View>
          ))}
          <View style={styles.noteForm}>
            <TextInput
              style={styles.noteInput}
              value={comment}
              onChangeText={setComment}
              placeholder="Add an observation…"
              placeholderTextColor="#929c97"
              multiline
            />
            <Pressable
              disabled={!comment.trim() || busy}
              style={styles.send}
              onPress={() =>
                void act(COMMENT, { taskId: item.id, body: comment }, 'Field note added.').then(
                  () => setComment(''),
                )
              }
            >
              <Ionicons name="send" size={17} color="white" />
            </Pressable>
          </View>
        </View>
      </ScrollView>
      <View style={styles.actionBar}>
        {item.status === 'OPEN' && (
          <Pressable
            disabled={busy}
            style={styles.outlineAction}
            onPress={() => void act(CLAIM, { id: item.id, version: item.version }, 'Task claimed.')}
          >
            <Text style={styles.outlineActionText}>Claim</Text>
          </Pressable>
        )}
        <Pressable
          disabled={busy || item.status === 'COMPLETED'}
          style={styles.mainAction}
          onPress={() =>
            void act(
              COMPLETE,
              {
                id: item.id,
                version: item.version,
                resolution: 'Animal observed; findings recorded and follow-up planned.',
              },
              'Task completed.',
            )
          }
        >
          <Ionicons name="checkmark" size={19} color="white" />
          <Text style={styles.mainActionText}>
            {item.status === 'COMPLETED' ? 'Completed' : 'Complete task'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
function CaseDetail({ item, back }: { item: HealthCase; back: () => void }) {
  return (
    <View style={styles.detailScreen}>
      <DetailHeader title="Health case" back={back} />
      <ScrollView contentContainerStyle={styles.detailBody}>
        <View style={styles.caseDetailHero}>
          <Avatar name={item.animal.displayName} large />
          <View style={styles.caseHeroCopy}>
            <Priority value={item.priority} />
            <Text style={styles.detailTitle}>{item.animal.displayName}</Text>
            <Text style={styles.detailAnimal}>
              {item.animal.officialId} · {item.animal.group?.name}
            </Text>
          </View>
          <View style={styles.riskCircle}>
            <Text style={styles.riskLabel}>RISK</Text>
            <Text style={styles.riskNumber}>{item.score}</Text>
          </View>
        </View>
        <View style={styles.whiteCard}>
          <Text style={styles.cardLabel}>WHY THIS IS PRIORITIZED</Text>
          {item.riskAssessment?.reasons.map((reason) => (
            <View style={styles.reason} key={reason.code}>
              <View style={styles.reasonPoints}>
                <Text style={styles.reasonPointsText}>+{reason.points}</Text>
              </View>
              <Text style={styles.reasonText}>
                {reason.code.replaceAll('_', ' ').toLowerCase()}
              </Text>
            </View>
          ))}
        </View>
        <View style={styles.whiteCard}>
          <Text style={styles.cardLabel}>ORCHESTRATED WORK</Text>
          {item.tasks.map((task) => (
            <View style={styles.caseTask} key={task.id}>
              <Ionicons
                name={task.status === 'COMPLETED' ? 'checkmark-circle' : 'ellipse-outline'}
                size={20}
                color="#4f7f70"
              />
              <View>
                <Text style={styles.caseTaskTitle}>{task.title}</Text>
                <Text style={styles.rowMeta}>
                  {task.status.toLowerCase()} · {task.assigneeName || 'Unassigned'}
                </Text>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}
function AnimalDetail({ item, back }: { item: Animal; back: () => void }) {
  return (
    <View style={styles.detailScreen}>
      <DetailHeader title="Animal" back={back} />
      <ScrollView contentContainerStyle={styles.detailBody}>
        <View style={styles.animalDetailHero}>
          <Avatar name={item.displayName} large />
          <Text style={styles.detailTitle}>{item.displayName}</Text>
          <Text style={styles.detailAnimal}>{item.officialId}</Text>
          {item.activeCase ? (
            <Priority value={item.activeCase.priority} />
          ) : (
            <View style={styles.clear}>
              <Text style={styles.clearText}>NO ACTIVE CASE</Text>
            </View>
          )}
        </View>
        <View style={styles.whiteCard}>
          <Text style={styles.cardLabel}>CONTEXT</Text>
          {[
            ['Group', item.group?.name],
            ['Lifecycle', item.lactationPhase.toLowerCase()],
            ['Device', item.device?.status.toLowerCase()],
            ['Battery', item.device?.batteryPercent ? `${item.device.batteryPercent}%` : '—'],
          ].map(([label, value]) => (
            <View style={styles.infoRow} key={label}>
              <Text style={styles.infoLabel}>{label}</Text>
              <Text style={styles.infoValue}>{value}</Text>
            </View>
          ))}
        </View>
        <View style={styles.whiteCard}>
          <Text style={styles.cardLabel}>LATEST SIGNALS</Text>
          {[
            ['Temperature', '38.6 °C', 'stable'],
            ['Rumination', '426 min/day', 'normal'],
            ['Activity', '54 index', 'normal'],
          ].map(([label, value, state]) => (
            <View style={styles.signal} key={label}>
              <View>
                <Text style={styles.signalLabel}>{label}</Text>
                <Text style={styles.signalState}>{state}</Text>
              </View>
              <Text style={styles.signalValue}>{value}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f3f4f0' },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    backgroundColor: '#f3f4f0',
  },
  pulseMark: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: '#a8d7b5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    height: 64,
    paddingHorizontal: 19,
    borderBottomWidth: 1,
    borderBottomColor: '#e1e4df',
    backgroundColor: '#fbfcfa',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  brandText: { fontSize: 20, fontWeight: '700', color: '#173f36' },
  brandAccent: { color: '#5e9975' },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  live: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#51aa70' },
  liveText: { fontSize: 9, fontWeight: '800', letterSpacing: 1, color: '#507769' },
  user: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#d17d43',
    alignItems: 'center',
    justifyContent: 'center',
  },
  userText: { color: 'white', fontWeight: '800' },
  content: { flex: 1 },
  contentInner: { padding: 20, paddingBottom: 105 },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 2 },
  eyebrow: { fontSize: 9, fontWeight: '800', letterSpacing: 1.3, color: '#547a6e' },
  pageKicker: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.3,
    color: '#547a6e',
    marginTop: 2,
  },
  title: { marginTop: 8, fontSize: 29, fontWeight: '800', letterSpacing: -1, color: '#1b2d29' },
  subtitle: { marginTop: 5, fontSize: 14, color: '#727e78' },
  stats: { flexDirection: 'row', gap: 11, marginTop: 23, marginBottom: 27 },
  stat: {
    flex: 1,
    padding: 16,
    borderWidth: 1,
    borderColor: '#dce2dd',
    borderRadius: 14,
    backgroundColor: 'white',
  },
  statUrgent: { borderColor: '#eccbc3', backgroundColor: '#fff9f7' },
  statLabel: { fontSize: 8, fontWeight: '800', letterSpacing: 1, color: '#77827d' },
  statValue: { marginTop: 6, fontSize: 29, lineHeight: 34, fontWeight: '800', color: '#213830' },
  statFoot: { fontSize: 10, color: '#7b8580' },
  sectionTitle: { marginBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 7 },
  sectionTitleText: { fontSize: 16, fontWeight: '800', color: '#243a34' },
  count: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 10, backgroundColor: '#dfe9e3' },
  countText: { fontSize: 10, fontWeight: '700', color: '#41675c' },
  taskCard: {
    marginBottom: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: '#dce2dd',
    borderRadius: 13,
    backgroundColor: 'white',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  taskIcon: {
    width: 37,
    height: 37,
    borderRadius: 10,
    backgroundColor: '#e8f0ec',
    alignItems: 'center',
    justifyContent: 'center',
  },
  taskIconUrgent: { backgroundColor: '#f9e8e4' },
  rowCopy: { flex: 1 },
  rowTop: {
    marginBottom: 7,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  priority: {
    alignSelf: 'flex-start',
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  priorityDot: { width: 5, height: 5, borderRadius: 3 },
  priorityText: { fontSize: 8, fontWeight: '800', letterSpacing: 0.3 },
  due: { fontSize: 9, fontWeight: '700', color: '#7d8782' },
  dueUrgent: { color: '#b94d39' },
  taskTitle: { fontSize: 13, fontWeight: '700', color: '#273d37' },
  rowTitle: { fontSize: 13, fontWeight: '700', color: '#273d37' },
  rowMeta: { marginTop: 3, fontSize: 10, color: '#76827c' },
  tabs: {
    height: 71,
    paddingBottom: 7,
    borderTopWidth: 1,
    borderTopColor: '#dde2dd',
    backgroundColor: '#fdfefd',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  tab: { minWidth: 70, alignItems: 'center', gap: 3 },
  tabText: { fontSize: 9, color: '#89938f' },
  tabTextActive: { color: '#174b3e', fontWeight: '800' },
  tabBadge: {
    position: 'absolute',
    zIndex: 2,
    right: -9,
    top: -7,
    minWidth: 17,
    height: 17,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: '#c5513c',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabBadgeText: { fontSize: 8, fontWeight: '800', color: 'white' },
  error: {
    margin: 12,
    marginBottom: 0,
    padding: 12,
    borderWidth: 1,
    borderColor: '#ecc9c1',
    borderRadius: 10,
    backgroundColor: '#fff5f2',
    flexDirection: 'row',
    gap: 10,
  },
  errorTitle: { fontSize: 11, fontWeight: '800', color: '#803e31' },
  errorCopy: { maxWidth: 280, marginTop: 2, fontSize: 9, color: '#94685f' },
  errorUrl: { marginTop: 3, fontSize: 8, color: '#a38179' },
  filterPill: {
    alignSelf: 'flex-start',
    marginVertical: 20,
    padding: 4,
    borderRadius: 10,
    backgroundColor: '#e5e9e5',
    flexDirection: 'row',
  },
  filterPillActive: {
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: 7,
    overflow: 'hidden',
    backgroundColor: 'white',
    fontSize: 10,
    fontWeight: '800',
    color: '#264b40',
  },
  filterPillText: { paddingHorizontal: 13, paddingVertical: 7, fontSize: 10, color: '#74817b' },
  caseCard: {
    height: 74,
    marginBottom: 9,
    paddingRight: 12,
    borderWidth: 1,
    borderColor: '#dfe3df',
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: 'white',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  caseStripe: { width: 4, height: 43, borderTopRightRadius: 4, borderBottomRightRadius: 4 },
  avatar: {
    width: 39,
    height: 39,
    borderRadius: 11,
    backgroundColor: '#dcebe4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 15, fontWeight: '800', color: '#31584e' },
  avatarLarge: { width: 62, height: 62, borderRadius: 17 },
  avatarTextLarge: { fontSize: 24 },
  caseScore: { alignItems: 'center' },
  caseScoreLabel: { fontSize: 7, color: '#8e9792' },
  caseScoreValue: { fontSize: 17, fontWeight: '800', color: '#2b403a' },
  animalRow: {
    minHeight: 68,
    marginBottom: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#dfe3df',
    borderRadius: 12,
    backgroundColor: 'white',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  clear: { paddingHorizontal: 8, paddingVertical: 5, borderRadius: 12, backgroundColor: '#e5f0e9' },
  clearText: { fontSize: 8, fontWeight: '800', color: '#477a68' },
  search: {
    height: 45,
    marginVertical: 19,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#d9dfda',
    borderRadius: 11,
    backgroundColor: 'white',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  searchInput: { flex: 1, fontSize: 12, color: '#263d36' },
  empty: { marginTop: 30, padding: 30, alignItems: 'center' },
  emptyTitle: { marginTop: 9, fontSize: 14, fontWeight: '800', color: '#315047' },
  emptyCopy: {
    marginTop: 4,
    maxWidth: 260,
    textAlign: 'center',
    fontSize: 11,
    lineHeight: 16,
    color: '#7a8680',
  },
  detailScreen: { flex: 1, backgroundColor: '#f3f4f0' },
  detailHeader: {
    height: 60,
    paddingHorizontal: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e4df',
    backgroundColor: '#fbfcfa',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  back: {
    width: 37,
    height: 37,
    borderRadius: 11,
    backgroundColor: '#edf1ed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backSpacer: { width: 37 },
  detailHeaderTitle: { fontSize: 14, fontWeight: '800', color: '#263d36' },
  detailBody: { padding: 17, paddingBottom: 110 },
  detailHero: { padding: 20, borderRadius: 15, backgroundColor: '#173f36' },
  detailTitle: {
    marginTop: 12,
    fontSize: 22,
    fontWeight: '800',
    color: 'white',
    letterSpacing: -0.5,
  },
  detailAnimal: { marginTop: 4, fontSize: 11, color: '#b6cac3' },
  dueRow: {
    marginTop: 16,
    paddingTop: 13,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,.12)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  detailDue: { fontSize: 10, color: '#c3d2cd' },
  whiteCard: {
    marginTop: 13,
    padding: 17,
    borderWidth: 1,
    borderColor: '#dce2dd',
    borderRadius: 13,
    backgroundColor: 'white',
  },
  cardLabel: {
    marginBottom: 12,
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 1.1,
    color: '#738079',
  },
  instructions: { fontSize: 12, lineHeight: 19, color: '#4e5f59' },
  note: { marginBottom: 10, flexDirection: 'row', gap: 9 },
  noteAvatar: {
    width: 28,
    height: 28,
    borderRadius: 9,
    backgroundColor: '#e1eae5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  noteAvatarText: { fontSize: 10, fontWeight: '800', color: '#45695f' },
  noteCopy: {
    flex: 1,
    padding: 9,
    borderRadius: 0,
    borderBottomWidth: 1,
    borderBottomColor: '#edf0ed',
  },
  noteAuthor: { fontSize: 10, fontWeight: '800', color: '#3d534c' },
  noteBody: { marginTop: 3, fontSize: 10, lineHeight: 15, color: '#68756f' },
  noteForm: {
    marginTop: 5,
    minHeight: 48,
    paddingLeft: 11,
    borderWidth: 1,
    borderColor: '#d9dfda',
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  noteInput: { flex: 1, maxHeight: 70, fontSize: 11, color: '#2b4039' },
  send: {
    width: 39,
    alignSelf: 'stretch',
    borderTopRightRadius: 9,
    borderBottomRightRadius: 9,
    backgroundColor: '#245f50',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    minHeight: 77,
    padding: 12,
    paddingBottom: Platform.OS === 'ios' ? 20 : 12,
    borderTopWidth: 1,
    borderTopColor: '#dce2dd',
    backgroundColor: 'white',
    flexDirection: 'row',
    gap: 9,
  },
  outlineAction: {
    minWidth: 90,
    paddingHorizontal: 17,
    borderWidth: 1,
    borderColor: '#cfd8d2',
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  outlineActionText: { fontSize: 12, fontWeight: '800', color: '#31574c' },
  mainAction: {
    flex: 1,
    minHeight: 48,
    borderRadius: 11,
    backgroundColor: '#174b3e',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  mainActionText: { fontSize: 12, fontWeight: '800', color: 'white' },
  caseDetailHero: {
    padding: 17,
    borderRadius: 15,
    backgroundColor: '#173f36',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  caseHeroCopy: { flex: 1 },
  riskCircle: {
    width: 57,
    height: 57,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,.2)',
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
  },
  riskLabel: { fontSize: 7, color: '#aec3bb' },
  riskNumber: { fontSize: 21, fontWeight: '800', color: 'white' },
  reason: { marginBottom: 9, flexDirection: 'row', alignItems: 'center', gap: 10 },
  reasonPoints: {
    width: 34,
    height: 34,
    borderRadius: 9,
    backgroundColor: '#f6e9dc',
    alignItems: 'center',
    justifyContent: 'center',
  },
  reasonPointsText: { fontSize: 11, fontWeight: '800', color: '#996231' },
  reasonText: { fontSize: 11, color: '#485b54', textTransform: 'capitalize' },
  caseTask: {
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: '#edf0ed',
    flexDirection: 'row',
    gap: 9,
    alignItems: 'center',
  },
  caseTaskTitle: { fontSize: 11, fontWeight: '700', color: '#344b44' },
  animalDetailHero: {
    padding: 23,
    borderRadius: 15,
    backgroundColor: '#173f36',
    alignItems: 'center',
  },
  infoRow: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#edf0ed',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  infoLabel: { fontSize: 11, color: '#79857f' },
  infoValue: { fontSize: 11, fontWeight: '700', color: '#344a43', textTransform: 'capitalize' },
  signal: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#edf0ed',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  signalLabel: { fontSize: 11, fontWeight: '700', color: '#354b44' },
  signalState: { marginTop: 2, fontSize: 9, color: '#589074' },
  signalValue: { fontSize: 13, fontWeight: '800', color: '#2b443c' },
});
