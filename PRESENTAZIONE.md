# Quando è il dato a fare la differenza

## Una vetrina che l'intelligenza artificiale sa leggere davvero

### Il punto di partenza

Abbiamo un catalogo dimostrativo: 63 prodotti, sei settori — largo consumo, alimenti
freschi, foodservice, abbigliamento, sanità, costruzioni. Ogni prodotto ha la sua
pagina, raggiungibile dal suo GS1 Digital Link: scansioni il codice, arrivi alla scheda.

Fin qui, un normale sito di prodotto. La differenza sta in ciò che non si vede: dentro
ogni pagina è pubblicato un blocco di dati strutturati in GS1 Web Vocabulary — gli
ingredienti dichiarati, gli allergeni con il loro livello di contenimento, i valori
nutrizionali con la base di riferimento, i materiali tessili, il paese di origine, i
pesi e le dimensioni, le certificazioni. Non un testo da interpretare: dati con un
significato dichiarato, gli stessi che l'azienda pubblica nei suoi processi.

La domanda che questa demo si pone è semplice: **quel dato, a che cosa serve davvero?**

### La risposta: un assistente che non inventa

Alla pagina `/assistente` c'è ora una chat. Non una simulazione: un vero agente
commerciale, costruito sullo stack che Google ha pubblicato per il commercio agentico
(Agent Development Kit, protocollo A2A per il dialogo fra agenti, Universal Commerce
Protocol per il checkout), con un modello Gemini a guidarlo.

Quello che rende interessante questa chat non è che risponda. È **da dove prende quello
che dice**.

Chiedete "che allergeni ha la confettura di fragole?" e l'agente non risponde a memoria.
Cerca il prodotto nel catalogo, apre la sua scheda GS1, legge il campo degli allergeni e
risponde citando la fonte: *"Può contenere sedano, pesce, latte, molluschi, soia, frutta
a guscio. La fonte ufficiale di questi dati è GS1 Italy."* La stessa informazione che
sta sulla confezione, arrivata all'utente senza che nessuno l'abbia riscritta a mano da
qualche parte.

E poi può concludere: aggiungere al carrello, raccogliere l'indirizzo, calcolare totali
e spedizione, confermare l'ordine. Il pagamento è simulato — è una demo — ma il percorso
è quello vero, sul protocollo standard.

### La prova più convincente è quando dice di no

Sedici dei sessantatré prodotti, di proposito, non pubblicano dati strutturati.
Rappresentano l'azienda che non ha ancora fatto quel lavoro.

Chiedete all'agente gli ingredienti di uno di quelli, e la risposta è:

> *"Questo prodotto non pubblica una scheda dati strutturata GS1, quindi non è possibile
> leggerne i dettagli relativi agli ingredienti e alla presenza di allergeni. Altri
> prodotti nel catalogo la forniscono regolarmente."*

Nessun tentativo di indovinare, nessuna informazione plausibile inventata per non fare
brutta figura. È qui che il messaggio diventa concreto: la qualità della risposta non
dipende da quanto è bravo il modello, ma da **quanto è ricco il dato che trova**. Chi
pubblica dati strutturati viene raccontato bene; chi non lo fa, semplicemente, non viene
raccontato.

Provate a chiedere qualcosa che nel catalogo non esiste. L'agente lo dirà, invece di
riempire il silenzio.

### Cosa mostrare, in ordine

1. **Il sito.** Una scheda prodotto qualsiasi, e il pannello che mostra il JSON-LD
   pubblicato nella pagina. Il dato è lì, visibile, verificabile.
2. **La stessa scheda, come la vede una macchina.** Lo stesso indirizzo, chiesto in
   formato dati, restituisce il documento GS1 puro. Una sola risorsa, due modi di
   leggerla: uno per le persone, uno per gli agenti.
3. **La chat.** Una ricerca, una domanda di dettaglio, la citazione della fonte.
4. **Il prodotto senza dati.** La stessa domanda, e l'agente che dichiara il limite.
5. **L'ordine.** Dal carrello alla conferma, dentro la conversazione.

### Perché conta

Sempre più spesso, fra il prodotto e la persona che lo compra c'è un assistente
conversazionale. Quell'assistente non guarda le fotografie e non legge la grafica della
confezione: legge i dati. Se non li trova, li deduce — e le deduzioni, sugli allergeni,
non sono un dettaglio.

Pubblicare i dati di prodotto in modo strutturato e standard non è un adempimento
tecnico: è la condizione perché il proprio prodotto continui a essere descritto
correttamente quando a descriverlo non è più un essere umano. È esattamente ciò che
questa demo mette sotto gli occhi: due prodotti sullo stesso scaffale, uno dei quali
l'agente sa raccontare e l'altro no. La differenza non è nel prodotto. È nel dato.

---

*Demo dimostrativa: i prodotti, le aziende e i pagamenti sono fittizi. I dati di prodotto
sono espressi in GS1 Web Vocabulary e schema.org secondo gli standard reali. Per il
dettaglio implementativo, vedi [ARCHITETTURA.md](ARCHITETTURA.md).*
